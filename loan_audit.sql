-- Run against data/loan_risk.sqlite, created by the notebook.
-- These queries describe the sampled, historically funded, resolved loans.
-- charged_off_rate is a fraction, not a one-year default probability.

-- Query 1: origination cohorts expose changes in sample mix and outcomes.
SELECT
    CAST(strftime('%Y', issue_d) AS INTEGER) AS origination_year,
    COUNT(*) AS loan_count,
    SUM(charged_off) AS charged_off_count,
    AVG(1.0 * charged_off) AS charged_off_rate
FROM loans
GROUP BY origination_year
ORDER BY origination_year;

-- Query 2: purpose mix and outcome rates. Small groups need caution.
SELECT
    COALESCE(purpose, 'Unknown') AS purpose,
    COUNT(*) AS loan_count,
    SUM(charged_off) AS charged_off_count,
    AVG(1.0 * charged_off) AS charged_off_rate
FROM loans
GROUP BY COALESCE(purpose, 'Unknown')
ORDER BY loan_count DESC, purpose;
