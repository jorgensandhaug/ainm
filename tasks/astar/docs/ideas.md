# Ideas


1. Potentially possible to fetch all historic data through GET /astar-island/rounds and GET /astar-island/rounds/{round_id} to train a model to learn the underlying stochastic modelling, and the ideas behind it. Maybe this doesn't change over time?

2. Mountains don't change at all over time, important to map these out?

3. Trees change slowly over time, probably with some fixed stochastic process?

4. Water always "borders the map", maybe create some heatmap or some probability distributions to overlay predictions for this or something like that?

5. Ways to incorporate these Map Generation rules in a smart approach:

- Each map is procedurally generated from a map seed:
- Ocean borders surround the map
- Fjords cut inland from random edges
- Mountain chains form via random walks
- Forest patches cover land with clustered groves
- Initial settlements placed on land cells, spaced apart



# Cycles

Are phases fixed-timesteps every round/map, or varying based on parameters?
