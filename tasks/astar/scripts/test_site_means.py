from statistics import fmean

populations = {
    (0, 0): [100.0, 110.0],
    (1, 1): [50.0]
}
site_mean_pops = [fmean(vals) for vals in populations.values()]
print(site_mean_pops)
print(fmean(site_mean_pops))
