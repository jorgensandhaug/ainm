"""Backward-compatible import shim.

The actual implementation lives in ``summary_bank.py``.
This file remains only because other repo entrypoints still import it.
"""

from astar.student.posterior.summary_bank import SummaryBankStudent, SummaryBankStudentCheckpoint

__all__ = ["SummaryBankStudent", "SummaryBankStudentCheckpoint"]
