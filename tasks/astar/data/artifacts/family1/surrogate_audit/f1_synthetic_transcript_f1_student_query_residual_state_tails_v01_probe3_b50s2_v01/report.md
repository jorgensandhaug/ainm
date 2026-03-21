synthetic-transcript-audit f1_synthetic_transcript_f1_student_query_residual_state_tails_v01_probe3_b50s2_v01

model: f1_student_query_residual_state_tails_v01
dataset: f1_synthetic_transcript_probe3_b50_s2_v01
policy_name: coverage
budget: 50
samples_per_round: 2
rounds: 3
episodes: 6
evaluated_seed_count: 30
aggregation_mode: equal_round_mean_over_episode_mean
aggregate_score: 72.123513
aggregate_weighted_kl: 0.109343

per_round:
- round=8e839974-b13b-407b-a5e7-fc749d877195 round_number=4 episodes=2 seeds=10 mean_queries=45.00 score=68.890241 weighted_kl=0.124286
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b round_number=5 episodes=2 seeds=10 mean_queries=45.00 score=76.245280 weighted_kl=0.090658
- round=ae78003a-4efe-425a-881a-d16a39bca0ad round_number=6 episodes=2 seeds=10 mean_queries=45.00 score=71.235018 weighted_kl=0.113086
