import numpy as np
from scipy.stats import chisquare, kstest, norm
from statsmodels.stats.diagnostic import acorr_ljungbox
from collections import Counter
from main import load_data_from_file, format_neos, dice_result, data_filename

# Parameters for the dice roll
dice_type = 20
roll_count = 10_000_000

# Load and format the NEO data
try:
    data_dict = load_data_from_file(data_filename)
except FileNotFoundError:
    raise FileNotFoundError("Data file not found. Please run the Flask app and fetch the data first.")
all_neos = format_neos(data_dict)

# Perform the test and collect results
results = [dice_result(all_neos, dice_type) for _ in range(roll_count)]

# Count occurrences
occurrences = Counter(results)

# Print the occurrences
for number in range(1, dice_type + 1):
    print(f'{number}: {occurrences[number]}')

# Convert occurrences to an array for statistical tests
observed = np.array([occurrences[number] for number in range(1, dice_type + 1)])

# Chi-Square Test
expected = np.full(dice_type, roll_count / dice_type)
chi2_stat, p_value = chisquare(observed, expected)
print(f'\nChi-Square Test: Chi2 Stat={chi2_stat}, p-value={p_value}')

# Mean and Variance
mean_observed = np.mean(results)
variance_observed = np.var(results, ddof=1)
expected_mean = (1 + dice_type) / 2
expected_variance = ((dice_type ** 2) - 1) / 12
print(f'\nMean Observed: {mean_observed}, Expected Mean: {expected_mean}')
print(f'Variance Observed: {variance_observed}, Expected Variance: {expected_variance}')

# Runs Test (Ljung-Box test for autocorrelation)
lags = min(40, (len(results) // 5))
lb_stat, lb_pvalue = acorr_ljungbox(results, lags=lags)
print(f'\nRuns Test (Ljung-Box): LB Stat={lb_stat}, p-values={lb_pvalue}')

# Kolmogorov-Smirnov Test
uniform_results = [(x - 0.5) / dice_type for x in results]  # Normalize to [0, 1)
ks_stat, ks_pvalue = kstest(uniform_results, 'uniform')
print(f'\nKolmogorov-Smirnov Test: KS Stat={ks_stat}, p-value={ks_pvalue}')
