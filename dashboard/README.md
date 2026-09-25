# Using the Loan Risk dashboard

After running `Setup Loan Risk.cmd` once on Windows, double-click
`Start Loan Risk.cmd`. It opens [the local dashboard](http://127.0.0.1:8765).
Keep the project folder in place. The app uses a small background
process and runs only on this computer; closing the browser does not stop that process.
Double-click **Stop Loan Risk.cmd** to stop it. Double-click **Start Loan Risk.cmd** again to reopen it.

## What to try

1. **Model performance:** inspect the original final-test metrics and compare both
   candidates on validation. Switch the ROC chart between validation and final test.
   The risk-band chart and calibration chart show what the headline AUC misses.
2. **Try a loan:** choose an example, change income, amount, DTI, FICO, employment or
   purpose, and click **Score this loan**. The real fitted pipeline calculates the score.
   The result explains its route and its numeric feature contributions. Clear income
   or FICO to see the missing-essential-input guard route the example to review.
3. **Decisions lab:** drag the sliders, or type two cutoffs and click **Apply cutoffs**.
   Routing counts, review volume and observed outcome rates update using the 2016
   validation records. Reset restores the
   original full-precision cutoffs. This does not alter the model, loan scorer or final report.
4. **Data & method:** inspect the time split, SQL purpose table, audit checks and limits.

## How to judge the result

- **ROC-AUC:** higher is better; 0.5 is random ranking and 1.0 is perfect. The test result
  of roughly 0.657 shows modest discrimination. It does **not** mean 65.7% accuracy.
- **Average precision:** summarizes precision along the recall curve. Compare it with
  the charged-off share shown as the random-ranking reference; higher is better.
- **Brier score:** average squared difference between scores and binary outcomes;
  lower is better. The comparison baseline predicts the training charged-off rate
  for every test loan. This checks more than ranking, including calibration.
- **Probability gap:** the model averages a 16.91% score while the observed test
  charged-off rate is 21.54%. The model understates outcomes; a score is not a calibrated
  personal probability or one-year probability of default.
- **Band rates:** higher scores should broadly correspond to higher observed rates.
  Here, the low/medium/high test bands are about 13% / 21% / 34%.

The original model and cutoffs stay frozen. Extra diagnostic metrics are calculated
from the same saved-experiment predictions; no new model selection uses test outcomes.
Interactive threshold experiments use **validation only**. These records were already
funded and resolved, so routing does not establish what would happen to rejected applicants.

## Rebuild or run manually

From the project folder:

```powershell
.\.venv\Scripts\python.exe dashboard/build_data.py
.\.venv\Scripts\python.exe dashboard/server.py --open
```

The first command executes the original notebook, verifies its checks and exports the
same model, results and validation scores into `dashboard/artifacts/`. The second starts
the interface. When launched manually, Ctrl+C stops it. If the launcher has already
started the app, open the existing URL instead of starting another copy.

To stop a launcher-started instance, double-click **Stop Loan Risk.cmd**.
The launcher never starts duplicate instances of this app on its default port.

The frontend uses plain HTML, CSS and JavaScript; the local server uses Python's standard
library. There are no external scripts, analytics or cloud calls. The analysis is exported
locally using the existing project dependencies. Input examples are not saved or logged.

For a fresh machine, follow the root README's Python setup instructions, then rebuild.
Only load model artifacts that you built or trust: this project loads its own local
joblib artifact, not uploaded model files.
