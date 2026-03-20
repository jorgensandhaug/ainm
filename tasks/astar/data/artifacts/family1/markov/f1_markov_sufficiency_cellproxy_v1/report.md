markov-sufficiency-audit f1_markov_sufficiency_cellproxy_v1

scope: cell_local_dynamic_proxy__descriptor_t_vs_descriptor_t_plus_prev_class
rounds: 9
transition_count: 157621632
current_log_loss: 0.066055
lag_log_loss: 0.065768
log_loss_gain: 0.000287
current_accuracy: 0.983955
lag_accuracy: 0.983977
accuracy_gain: 0.000023
markov_sufficiency: likely

notes:
- proxy audit over dynamic cells only
- conditioning compares cell-local descriptor at t vs same descriptor plus previous cell class
- strong lag gains here are evidence against strong observed-state Markov sufficiency

event_metrics:
- birth_or_found: n=144192656 prev=0.0053 current_ll=0.031173 lag_ll=0.031170 gain=0.000004
- portization: n=11693783 prev=0.0037 current_ll=0.013592 lag_ll=0.012855 gain=0.000738
- collapse: n=12337807 prev=0.0776 current_ll=0.272179 lag_ll=0.269110 gain=0.003069
- rebuild: n=1091169 prev=0.4824 current_ll=0.688554 lag_ll=0.688790 gain=-0.000236
- reclaim_forest: n=1091169 prev=0.1658 current_ll=0.448587 lag_ll=0.448822 gain=-0.000235

per_round:
- round=2a341ace-0f57-4309-9b89-e59fe0f09179 n=2792412 current_ll=0.080484 lag_ll=0.079896 gain=0.000588
- round=36e581f1-73f8-453f-ab98-cbe3052b701b n=19405176 current_ll=0.062516 lag_ll=0.062471 gain=0.000045
- round=71451d74-be9f-471f-aacd-a41f3b68a9cd n=19629596 current_ll=0.066836 lag_ll=0.066748 gain=0.000088
- round=76909e29-f664-4b2f-b16b-61b7507277e9 n=19282970 current_ll=0.091175 lag_ll=0.091033 gain=0.000142
- round=8e839974-b13b-407b-a5e7-fc749d877195 n=19206236 current_ll=0.057487 lag_ll=0.057039 gain=0.000448
- round=ae78003a-4efe-425a-881a-d16a39bca0ad n=19422228 current_ll=0.125788 lag_ll=0.125688 gain=0.000100
- round=c5cdf100-a876-4fb7-b5d8-757162c97989 n=19314232 current_ll=0.038543 lag_ll=0.037981 gain=0.000562
- round=f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb n=19214762 current_ll=0.017078 lag_ll=0.016709 gain=0.000369
- round=fd3c92ff-3178-4dc9-8d9b-acf389b3982b n=19354020 current_ll=0.066337 lag_ll=0.065833 gain=0.000504
