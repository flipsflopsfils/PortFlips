"""Rerun the notebook and update the small files used by the dashboard.

Run from the project folder: python dashboard/build_data.py
The 167 MB source CSV is downloaded on the first run and cached in data/.
"""

from pathlib import Path
import os

import nbformat
from nbclient import NotebookClient


ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

# Jupyter's temporary files stay in the project rather than the user's profile.
runtime = ROOT / 'dashboard' / '.runtime'
runtime.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('JUPYTER_RUNTIME_DIR', str(runtime / 'jupyter'))
os.environ.setdefault('IPYTHONDIR', str(runtime / 'ipython'))
os.environ.setdefault('MPLCONFIGDIR', str(runtime / 'matplotlib'))

notebook_path = ROOT / 'loan_risk_analysis.ipynb'
notebook = nbformat.read(notebook_path, as_version=4)
notebook.cells.append(nbformat.v4.new_code_cell('%run -i dashboard/export_results.py'))

print('Running the analysis notebook. This may take a minute...', flush=True)
NotebookClient(
    notebook,
    timeout=600,
    kernel_name='python3',
    resources={'metadata': {'path': str(ROOT)}},
).execute()

for output in notebook.cells[-1].outputs:
    if output.output_type == 'stream':
        print(output.text, end='')

notebook.cells.pop()
for cell in notebook.cells:
    cell.metadata.pop('execution', None)
nbformat.write(notebook, notebook_path)
print('Notebook and dashboard files are up to date.', flush=True)
