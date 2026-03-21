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
    # What if it's port (2) to settlement (1)? 
    # previous_code in BUILT_CODES (True)
    # current_code == 2 (False)
    # previous_code != 3 (True)
    # current_code == 3 (False)
    # previous_code != 4 (True)
    # current_code == 4 (False)
    # previous_code in BUILT_CODES (True)
    # current_code in EMPTY_CODES (False)
    
    if previous_code != 3 and current_code == 3:
        return "ruin"
    if previous_code != 4 and current_code == 4:
        return "forest_gain"
    if previous_code in BUILT_CODES and current_code in EMPTY_CODES:
        return "clear"
    return "change"

print("Port loss event (2 -> 1):", _cell_event_kind(2, 1))
