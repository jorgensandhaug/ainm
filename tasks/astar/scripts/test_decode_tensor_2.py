import numpy as np

# Scenario: 60% built, 20% ruin, 10% port
build_score = 0.6
raw_ruin = 0.2
raw_port = 0.1

print("--- NEW LOGIC (MARGINAL) ---")
ruin_prob = min(raw_ruin, build_score)
port_prob = min(raw_port, build_score - ruin_prob)
settlement_prob = build_score - ruin_prob - port_prob
print(f"Ruin: {ruin_prob}, Port: {port_prob}, Settlement: {settlement_prob}, Total Build: {ruin_prob+port_prob+settlement_prob}")

print("\n--- OLD LOGIC (CONDITIONAL) ---")
# If the model output 0.2 and 0.1, the old logic treated them as conditionals:
ruin_prob_old = build_score * raw_ruin
port_prob_old = build_score * (1.0 - raw_ruin) * raw_port
settlement_prob_old = build_score * (1.0 - raw_ruin) * (1.0 - raw_port)
print(f"Ruin: {ruin_prob_old:.3f}, Port: {port_prob_old:.3f}, Settlement: {settlement_prob_old:.3f}, Total Build: {ruin_prob_old+port_prob_old+settlement_prob_old:.3f}")
