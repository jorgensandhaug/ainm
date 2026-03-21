def _cell_event_kind(previous_code: int, current_code: int) -> str:
    BUILT_CODES = (1, 2, 3)
    EMPTY_CODES = (0, 10, 11)
    
    if previous_code == current_code:
        return "unchanged"
    if previous_code == 3 and current_code in (1, 2):
        return "rebuild"
    if previous_code == 3 and current_code == 4:
        return "ruin_to_forest"
    if previous_code not in BUILT_CODES and current_code in (1, 2):
        return "build"
    if previous_code in BUILT_CODES and current_code == 2 and previous_code != 2:
        return "port_gain"
    if previous_code != 3 and current_code == 3:
        return "ruin"
    if previous_code != 4 and current_code == 4:
        return "forest_gain"
    if previous_code in BUILT_CODES and current_code in EMPTY_CODES:
        return "clear"
    return "change"

# Test 1: Plains (0) to Settlement (1)
print("0 -> 1:", _cell_event_kind(0, 1))

# Test 2: Settlement (1) to Ruin (3)
print("1 -> 3:", _cell_event_kind(1, 3))

# Test 3: Port (2) to Ruin (3) 
print("2 -> 3:", _cell_event_kind(2, 3))

# Test 4: Ruin (3) to Port (2)
print("3 -> 2:", _cell_event_kind(3, 2))

# Test 5: Settlement (1) to Port (2)
print("1 -> 2:", _cell_event_kind(1, 2))

# Test 6: Port (2) to Settlement (1)
print("2 -> 1:", _cell_event_kind(2, 1))

