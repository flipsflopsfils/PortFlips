"""Local-only dashboard using the pipeline fitted by loan_risk_analysis.ipynb."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import argparse
import json
import math
from numbers import Real
import sys
import threading
import webbrowser

import joblib
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ARTIFACTS = HERE / 'artifacts'
SUMMARY = json.loads((ARTIFACTS / 'summary.json').read_text(encoding='utf-8'))
MODEL = joblib.load(ARTIFACTS / 'model.joblib')  # Only the artifact built locally by this project.
with np.load(ARTIFACTS / 'validation.npz') as validation:
    VAL_SCORES = validation['scores'].copy()
    VAL_OUTCOMES = validation['outcomes'].copy()
NUMERIC = ['revenue', 'dti_n', 'loan_amnt', 'fico_n']
CATEGORIES = ['emp_length', 'purpose']
LABELS = {'revenue': 'Annual income', 'dti_n': 'Debt-to-income ratio',
          'loan_amnt': 'Requested amount', 'fico_n': 'FICO score',
          'emp_length': 'Employment length', 'purpose': 'Loan purpose'}


def valid_number(value):
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)


def route(score, lower, upper):
    return 'approve' if score < lower else 'review' if score < upper else 'decline'


def score_application(application):
    if not isinstance(application, dict):
        raise ValueError('Enter a loan using the six input fields.')
    clean, missing, notices = {}, [], []
    for field in NUMERIC:
        value = application.get(field)
        invalid = not valid_number(value)
        if not invalid:
            invalid = ((field in ['revenue', 'loan_amnt'] and value <= 0)
                       or (field == 'dti_n' and value < 0)
                       or (field == 'fico_n' and not 300 <= value <= 850))
        if invalid:
            missing.append(LABELS[field])
            continue
        clean[field] = float(value)
        profile = SUMMARY['numeric_profiles'][field]
        if value < profile['p01'] or value > profile['p99']:
            notices.append(f"{LABELS[field]} is outside the middle 98% of the training sample; this example is less representative.")
    if missing:
        return {'decision': 'review', 'score': None, 'missing': missing, 'notices': [],
                'reason': 'Complete or correct these essential inputs before scoring: ' + ', '.join(missing) + '.'}
    for field in CATEGORIES:
        value = application.get(field)
        if value is None or value == '' or (field == 'emp_length' and value == 'NI'):
            clean[field] = np.nan
        elif isinstance(value, str) and len(value) < 100:
            clean[field] = value
            if value not in SUMMARY['categories'][field]:
                notices.append(f'{LABELS[field]} was not seen in training; interpret the score cautiously.')
        else:
            raise ValueError(f'Choose a valid {LABELS[field].lower()}.')
    frame = pd.DataFrame([clean], columns=SUMMARY['features'])
    score = float(MODEL.predict_proba(frame)[0, 1])
    lower, upper = SUMMARY['cutoffs']
    decision = route(score, lower, upper)
    band_index = {'approve': 0, 'review': 1, 'decline': 2}[decision]
    result = {'score': score, 'decision': decision, 'missing': [], 'notices': notices,
              'reason': 'Using the original validation-derived cutoffs.',
              'band': SUMMARY['test_bands'][band_index], 'contributions': []}
    # Exact additive contributions to the fitted logistic model's log-odds.
    # They are associations conditional on other inputs, not causal explanations.
    estimator = MODEL.named_steps['model']
    if hasattr(estimator, 'coef_'):
        transformed = MODEL.named_steps['prepare'].transform(frame)[0]
        names = MODEL.named_steps['prepare'].get_feature_names_out()
        weights = transformed * estimator.coef_[0]
        grouped = {field: 0.0 for field in SUMMARY['features']}
        for name, contribution in zip(names, weights):
            for field in SUMMARY['features']:
                if name.endswith('__' + field) or name.startswith('category__' + field + '_'):
                    grouped[field] += float(contribution)
                    break
        result['contributions'] = sorted(
            [{'feature': LABELS[k], 'value': v} for k, v in grouped.items()],
            key=lambda item: abs(item['value']), reverse=True)
        result['intercept'] = float(estimator.intercept_[0])
    return result


def validation_routes(payload):
    lower, upper = payload.get('lower'), payload.get('upper')
    if not valid_number(lower) or not valid_number(upper) or not 0 <= lower < upper <= 1:
        raise ValueError('The lower cutoff must be below the upper cutoff, between 0 and 100%.')
    masks = [VAL_SCORES < lower, (VAL_SCORES >= lower) & (VAL_SCORES < upper), VAL_SCORES >= upper]
    rows = []
    for name, mask in zip(['approve', 'review', 'decline'], masks):
        count = int(mask.sum())
        outcomes = int(VAL_OUTCOMES[mask].sum())
        rows.append({'decision': name, 'loans': count, 'charged_off_count': outcomes,
                     'share': count / len(VAL_SCORES),
                     'observed_rate': outcomes / count if count else None})
    return {'rows': rows, 'split': 'Validation only', 'n': len(VAL_SCORES),
            'charged_off_capture': rows[2]['charged_off_count'] / int(VAL_OUTCOMES.sum()),
            'lower': lower, 'upper': upper}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, status, body, content_type='application/json; charset=utf-8'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, allow_nan=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.send(200, {'app': 'loan-risk-local', 'status': 'ready'})
        if path == '/api/summary':
            return self.send(200, SUMMARY)
        allowed = {'/': ('index.html', 'text/html; charset=utf-8'),
                   '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                   '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
                   '/favicon.svg': ('favicon.svg', 'image/svg+xml')}
        if path not in allowed:
            return self.send(404, {'error': 'Page not found.'})
        filename, kind = allowed[path]
        return self.send(200, (HERE / 'web' / filename).read_bytes(), kind)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin not in [f'http://127.0.0.1:{self.server.server_port}',
                                      f'http://localhost:{self.server.server_port}']:
            return self.send(403, {'error': 'Use the local dashboard to submit inputs.'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 16_384:
                raise ValueError('Request is empty or too large.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('Expected an input object.')
            path = urlparse(self.path).path
            if path == '/api/score':
                result = score_application(payload)
            elif path == '/api/validation-routes':
                result = validation_routes(payload)
            elif path == '/api/shutdown':
                self.send(200, {'status': 'stopping'})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            else:
                return self.send(404, {'error': 'Action not found.'})
            self.send(200, result)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send(400, {'error': str(error)})
        except Exception:
            self.send(500, {'error': 'The calculation could not finish. Restart the local app and try again.'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    address = f'http://127.0.0.1:{args.port}'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        print(f'Could not start {address}. The dashboard may already be running.', file=sys.stderr)
        sys.exit(1)
    print(f'Loan Risk dashboard: {address}', flush=True)
    if args.open:
        webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
