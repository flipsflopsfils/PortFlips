# Loan Risk Analysis

I wanted to see how far a small, understandable model could get using information
available when a loan is requested. I used public Lending Club records to compare
logistic regression with a shallow decision tree, checked them on later loan cohorts,
and built a local dashboard to explore the results.

**The short answer:** logistic regression ranked charged-off loans better than the
tree. Its ROC-AUC was **0.651** on validation and **0.657** on the later test set.
That is useful separation, but the scores were too low relative to the observed
charged-off rate. I use them as ranking scores, not as reliable probabilities.

## Try the dashboard

The repository includes a small fitted model and the results needed to run the
dashboard. You do **not** need to download the 167 MB source dataset just to try it.

**Windows:** Install Python 3.12, then double-click `Setup Loan Risk.cmd` once.
Double-click `Start Loan Risk.cmd` to open the dashboard at
[http://127.0.0.1:8765](http://127.0.0.1:8765). `Stop Loan Risk.cmd` closes it.

**macOS or Linux:** From this folder, run:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python dashboard/server.py --open
```

In the dashboard you can inspect the model metrics, score an example loan, and
move the two routing cutoffs. Cutoff experiments use the **validation** loans.
The original final-test results stay fixed. The interface runs on your computer;
the examples you enter are not saved or sent to a service. See the
[dashboard guide](dashboard/README.md) for the controls.

## What I did

The source is the [Lending Club loan dataset for granting models, version 0.1](https://doi.org/10.5281/zenodo.11295916),
curated by Ariza-Garzón, Sanz-Guerrero and Arroyo Gallardo (2024). It contains
**1,347,681 funded loans** with a final outcome of fully paid or charged off.
I randomly sampled **50,000** loans without replacement (`random_state=42`).

I checked IDs, dates, outcomes, missing values and unusual numbers. The sample had
no duplicate IDs, invalid dates or missing numeric inputs. Employment length had
**2,886** values coded `NI` for no information; the pipeline treats these as
unknown. I kept and reported extreme income and debt-to-income values rather than
silently deleting them. Two queries in [loan_audit.sql](loan_audit.sql) show counts
and charged-off rates by origination year and loan purpose. Their totals reconcile
with the Python sample.

The six model inputs are annual income, debt-to-income ratio, requested amount,
FICO score, employment length and loan purpose. The dataset curators describe
these as application-time fields. I left out loan ID, the outcome and the
origination date; the date is used only to make the split. The curators also
removed Lending Club's interest rate and internal grade, which would bring the
lender's own assessment into the model.

| Cohort | Origination dates | Loans | Charged off |
| --- | --- | ---: | ---: |
| Train | Jul 2007–Dec 2015 | 30,692 | 18.22% |
| Validation | Jan–Dec 2016 | 10,965 | 23.58% |
| Final test | Jan 2017–Dec 2018 | 8,343 | 21.54% |

I fitted preprocessing and models on the training cohort only. The pipelines
fill missing numeric inputs with training medians, log-transform income and
loan amount, scale numeric inputs and encode categories. The two fixed models
were L2 logistic regression and a decision tree with depth at most three and
at least 200 training loans per leaf. I chose the model using **validation
ROC-AUC**, then evaluated that choice on the later test cohort.

## Results

| Model | Validation ROC-AUC | Final-test ROC-AUC |
| --- | ---: | ---: |
| Logistic regression | **0.6512** | **0.6568** |
| Decision tree | 0.6160 | Not evaluated |

An ROC-AUC of 0.5 is random ranking and 1.0 is perfect ranking. The test result
shows a modest signal; **0.657 is not 65.7% classification accuracy**. On the
final test, average precision was **0.327** against a charged-off share of
**0.215**. The Brier score was **0.164**, compared with **0.170** from predicting
the training charged-off rate for every test loan. That small improvement does
not establish that the scores are calibrated.

I split the selected model's **validation scores** at one-third and two-thirds
percentiles. The cutoffs are 0.1370 and 0.2127 at four decimals. Keeping them
fixed, the final-test records fell into these groups:

| Score group | Loans | Observed charged-off rate |
| --- | ---: | ---: |
| Low | 3,360 | 12.95% |
| Middle | 2,683 | 21.36% |
| High | 2,300 | 34.30% |

The dashboard calls these routes *approve*, *review* and *decline* to show how
a score could enter a workflow. The cutoffs simply made three roughly equal
validation groups. They were **not** chosen using lending costs, review capacity,
regulation or a bank's credit policy. On the later test set, the mean model
score was **16.91%**, while **21.54%** of loans charged off. The calibration
plot shows the same shortfall across score groups. I would not call these
scores calibrated probabilities of default.

## What the result cannot answer

Only **funded, resolved** loans are in the dataset. Rejected applicants have no
observed repayment outcome here, and unresolved loans were excluded. Recent
cohorts may therefore overrepresent loans that resolved quickly. The dataset
also lacks resolution dates, so the chronological split is a comparison of
origination cohorts, not a reconstruction of which outcomes were already known
to a lender in 2016.

The target is eventual charged off versus fully paid, **not one-year default**.
The source is a historical US marketplace lender; I have not shown that the
model transfers to another lender or country. I did not test lending profit,
fairness, affordability or a real approval policy. In a bank, I would first
verify each input's definition and timestamp in the bank's own systems.

## Reproduce the analysis

The [notebook](loan_risk_analysis.ipynb) contains the audit, SQL results, model
comparison, plots and routing checks. It has already been run from top to
bottom. To repeat the run after installing the requirements, use:

```bash
python dashboard/build_data.py
```

Use `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on macOS/Linux
in place of `python` if your shell has not activated the environment. The first
run downloads the CSV from Zenodo and verifies its published MD5 hash
(`b019384d6bc65bf2a3e839362e4ff502`). It then updates the notebook outputs
and the small dashboard files in `dashboard/artifacts/`. The downloaded CSV,
SQLite database, virtual environment and temporary files stay out of Git.

The notebook checks that the time groups do not overlap, SQL totals reconcile,
and the fitted preprocessing uses training medians. It also runs **26** routing
checks, including scores exactly at both cutoffs and missing essential inputs.

The original dataset is credited above and linked directly; [OpenAIRE lists its
license as CC BY](https://explore.openaire.eu/search/dataset?pid=10.5281%2Fzenodo.11295916).
The full CSV is downloaded from Zenodo rather than copied into this repository.
