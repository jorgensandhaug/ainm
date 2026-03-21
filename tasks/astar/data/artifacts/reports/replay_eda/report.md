# Replay EDA

## Corpus
- rounds: 9
- seeds_with_replays: 46
- replay_runs: 7313
- skipped_short_replays: 1
- cell_year_transitions: 585040000
- changed_cell_years: 9492038
- changed_cell_year_rate: 1.6225%

## Hard Invariants
- mountain_break_count: 0
- mountain_birth_count: 0
- ocean_change_out_count: 0
- ocean_change_in_count: 0
- inland_port_gain_count: 0

## Dominant Cell Transitions
| from | to | count | share_of_changes |
| --- | --- | ---: | ---: |
| settlement (1) | ruin (3) | 2894600 | 30.50% |
| plains (11) | settlement (1) | 1731671 | 18.24% |
| ruin (3) | settlement (1) | 1606339 | 16.92% |
| ruin (3) | plains (11) | 1204440 | 12.69% |
| forest (4) | settlement (1) | 657153 | 6.92% |
| ruin (3) | forest (4) | 565925 | 5.96% |
| plains (11) | ruin (3) | 402749 | 4.24% |
| forest (4) | ruin (3) | 152583 | 1.61% |
| settlement (1) | port (2) | 134131 | 1.41% |
| port (2) | ruin (3) | 99782 | 1.05% |
| ruin (3) | port (2) | 42665 | 0.45% |

## Rates By Initial Terrain
| initial | site_runs | ever_changed | cell_year_change | ever_build | ever_ruin | ever_port |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ocean (10) | 1530035 | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |
| plains (11) | 7117691 | 25.99% | 1.73% | 21.71% | 18.80% | 1.51% |
| settlement (1) | 327601 | 95.45% | 6.44% | 16.22% | 95.38% | 1.47% |
| port (2) | 14163 | 96.55% | 6.53% | 14.74% | 96.55% | 27.82% |
| forest (4) | 2482167 | 27.07% | 1.80% | 22.62% | 19.58% | 1.45% |
| mountain (5) | 229143 | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% |

## Key Spatial Contrasts
| label | rate | numerator | denominator |
| --- | ---: | ---: | ---: |
| buildable_ever_changed | 28.65% | 2848259 | 9941622 |
| buildable_ever_build | 21.75% | 2161932 | 9941622 |
| buildable_ever_ruin | 21.63% | 2150728 | 9941622 |
| buildable_ever_port | 1.53% | 152186 | 9941622 |
| coastal_buildable_ever_changed | 21.52% | 382023 | 1775467 |
| inland_buildable_ever_changed | 30.20% | 2466236 | 8166155 |
| coastal_buildable_ever_build | 16.72% | 296806 | 1775467 |
| inland_buildable_ever_build | 22.84% | 1865126 | 8166155 |
| coastal_buildable_ever_port | 8.57% | 152186 | 1775467 |
| inland_buildable_ever_port | 0.00% | 0 | 8166155 |
| mountain_adjacent_buildable_ever_changed | 28.42% | 209875 | 738481 |
| non_mountain_adjacent_buildable_ever_changed | 28.67% | 2638384 | 9203141 |
| mountain_adjacent_buildable_ever_ruin | 22.42% | 165594 | 738481 |
| non_mountain_adjacent_buildable_ever_ruin | 21.57% | 1985134 | 9203141 |
| mountain_adjacent_buildable_ever_build | 21.26% | 157030 | 738481 |
| non_mountain_adjacent_buildable_ever_build | 21.78% | 2004902 | 9203141 |

## Edge Buckets
| edge_bucket | site_count | ever_changed | ever_build | ever_ruin |
| --- | ---: | ---: | ---: | ---: |
| 0 | 0 | 0.00% | 0.00% | 0.00% |
| 1 | 1016986 | 18.53% | 15.60% | 11.43% |
| 2 | 954023 | 27.22% | 20.19% | 19.27% |
| 3+ | 7970613 | 30.11% | 22.72% | 23.22% |

## Feature Gradient: coastal_exposure
| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | [0.0, 0.2) | 234788 | 30.19% | 23.39% | 23.10% | 0.00% |
| 1 | [0.2, 0.4) | 866794 | 30.27% | 22.99% | 23.50% | 0.00% |
| 2 | [0.4, 0.6) | 1691450 | 30.58% | 23.27% | 23.83% | 0.00% |
| 3 | [0.6, 0.8) | 2280344 | 30.29% | 22.69% | 23.91% | 0.00% |
| 4 | [0.8, 1.0) | 4868246 | 26.85% | 20.47% | 19.40% | 3.13% |

## Feature Gradient: settlement_proximity
| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | [0.0, 0.2) | 124445 | 6.99% | 5.92% | 4.02% | 2.46% |
| 1 | [0.2, 0.4) | 291333 | 7.66% | 6.65% | 4.42% | 1.37% |
| 2 | [0.4, 0.6) | 1241700 | 12.62% | 10.85% | 7.91% | 1.32% |
| 3 | [0.6, 0.8) | 3312225 | 22.32% | 18.62% | 15.71% | 1.39% |
| 4 | [0.8, 1.0) | 4971919 | 38.64% | 27.83% | 30.46% | 1.66% |

## Feature Gradient: frontier_score
| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | [0.0, 0.2) | 199564 | 26.86% | 18.30% | 19.97% | 6.58% |
| 1 | [0.2, 0.4) | 268707 | 41.08% | 25.44% | 32.09% | 5.33% |
| 2 | [0.4, 0.6) | 1165588 | 38.07% | 25.22% | 29.44% | 3.15% |
| 3 | [0.6, 0.8) | 2873659 | 30.43% | 21.97% | 23.35% | 1.52% |
| 4 | [0.8, 1.0) | 5434104 | 25.14% | 20.83% | 18.59% | 0.82% |

## Feature Gradient: forest_density
| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | [0.0, 0.2) | 3566093 | 28.11% | 21.10% | 21.41% | 2.34% |
| 1 | [0.2, 0.4) | 4930948 | 28.87% | 21.98% | 21.75% | 1.27% |
| 2 | [0.4, 0.6) | 1298379 | 29.10% | 22.38% | 21.74% | 0.47% |
| 3 | [0.6, 0.8) | 137626 | 30.17% | 23.83% | 22.14% | 0.07% |
| 4 | [0.8, 1.0) | 8576 | 32.37% | 26.74% | 23.55% | 0.00% |

## Feature Gradient: mountain_density
| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | [0.0, 0.2) | 9574218 | 28.66% | 21.78% | 21.59% | 1.58% |
| 1 | [0.2, 0.4) | 327677 | 28.70% | 21.13% | 23.01% | 0.26% |
| 2 | [0.4, 0.6) | 38714 | 26.71% | 19.40% | 22.09% | 0.00% |
| 3 | [0.6, 0.8) | 1013 | 19.15% | 16.58% | 15.00% | 0.00% |
| 4 | [0.8, 1.0) | 0 | 0.00% | 0.00% | 0.00% | 0.00% |

## Temporal Peaks
### Most dynamic steps
| step | changed_cells/run | build/run | ruin/run | forest_gain/run | collapses/run | owner_flip_rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 47 | 50.67 | 15.22 | 18.39 | 2.57 | 15.25 | 0.31% |
| 48 | 47.03 | 9.57 | 18.39 | 2.86 | 16.37 | 0.29% |
| 43 | 46.82 | 14.89 | 16.83 | 2.29 | 13.79 | 0.32% |
| 49 | 46.05 | 9.11 | 17.82 | 2.88 | 16.07 | 0.29% |
| 39 | 43.49 | 14.36 | 15.51 | 2.03 | 12.46 | 0.34% |

### Most build-heavy steps
| step | build/run | port_gain/run | births/run |
| --- | ---: | ---: | ---: |
| 47 | 15.22 | 0.92 | 15.22 |
| 43 | 14.89 | 0.80 | 14.89 |
| 11 | 14.75 | 0.30 | 14.75 |
| 35 | 14.48 | 0.64 | 14.48 |
| 39 | 14.36 | 0.71 | 14.36 |

### Most collapse-heavy steps
| step | ruin/run | collapses/run | rebuilds/run |
| --- | ---: | ---: | ---: |
| 48 | 18.39 | 16.37 | 9.34 |
| 49 | 17.82 | 16.07 | 9.34 |
| 47 | 18.39 | 15.25 | 8.31 |
| 44 | 16.89 | 14.98 | 8.53 |
| 46 | 16.39 | 14.83 | 8.27 |

## Settlement Food Buckets
| food_bucket | exposure_count | collapse_rate | owner_flip_rate |
| --- | ---: | ---: | ---: |
| <-50 | 0 | 0.00% | 0.00% |
| [-50,-10) | 0 | 0.00% | 0.00% |
| [-10,0) | 0 | 0.00% | 0.00% |
| [0,20) | 38491867 | 7.79% | 0.38% |
| [20,100) | 0 | 0.00% | 0.00% |
| >=100 | 0 | 0.00% | 0.00% |

## Most Dynamic Rounds
| round_number | round_id | runs | changed_cell_year_rate | build/run | ruin/run | collapses_per_100_live | owner_flips_per_100_live |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 6 | ae78003a-4efe-425a-881a-d16a39bca0ad | 838 | 3.27% | 711.11 | 955.28 | 9.58 | 0.06 |
| 2 | 76909e29-f664-4b2f-b16b-61b7507277e9 | 840 | 2.15% | 495.21 | 613.49 | 7.36 | 0.34 |
| 9 | 2a341ace-0f57-4309-9b89-e59fe0f09179 | 587 | 1.92% | 342.71 | 598.07 | 8.18 | 1.30 |
| 5 | fd3c92ff-3178-4dc9-8d9b-acf389b3982b | 845 | 1.70% | 326.68 | 514.03 | 7.72 | 0.35 |
| 7 | 36e581f1-73f8-453f-ab98-cbe3052b701b | 835 | 1.54% | 364.71 | 429.30 | 5.91 | 0.42 |
| 1 | 71451d74-be9f-471f-aacd-a41f3b68a9cd | 846 | 1.48% | 380.24 | 398.80 | 5.91 | 0.46 |
| 4 | 8e839974-b13b-407b-a5e7-fc749d877195 | 845 | 1.30% | 225.17 | 407.44 | 7.41 | 0.06 |
| 8 | c5cdf100-a876-4fb7-b5d8-757162c97989 | 835 | 0.91% | 84.22 | 321.66 | 11.15 | 0.55 |

## Next Investigations
- Fit simple site-level hazard models for build, ruin, port gain, and collapse using initial geometry plus previous-year settlement state.
- Compare replay terminal marginals against official post-round analyses to isolate where replay support still misses uncertainty mass.
- Quantify local contagion: whether nearby collapse, ruin creation, or owner flips predict next-year shocks at adjacent sites.
- Cluster rounds by dynamic signature to separate expansion-heavy, maritime-heavy, collapse-heavy, and reclamation-heavy regimes.
- Build residual heatmaps after controlling for coast, settlement proximity, forest density, and mountain density to expose genuinely strange map regions.
