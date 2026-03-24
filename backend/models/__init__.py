"""
backend.models — domain model package.

Re-exports every public symbol so that existing ``from backend.models import X``
statements continue to work without modification.
"""
from .shared import Meta, Summary, Account, SankeyFlow, PeriodKey
from .period import CashFlowWaterfall, PeriodData
from .debt import DebtAccount, DebtTrend, PayoffScenario, DebtProjection, DebtSection, AccountTerm, DebtSettingsUpdate
from .equity import StockScenarios, VestEvent, EquityGrant, EquityVestSummary, EquitySection, VestTranche, NewEquityGrant
from .budget import RoutingTarget, RoutingUpdate, RoutingTargetInput, CategoryRow, CategoryCreate, CategoryUpdate
from .profiles_ledger import (
    UserProfile, UserProfileUpdate, UserProfileCreate,
    Ledger, LedgerAccess, LedgerTransfer, Notification,
    LedgerCreate, LedgerShare, LedgerMember, LedgerWithMembers,
)
from .retirement import RetirementAccount, RetirementCreate, RetirementUpdate
from .income import IncomeSource, IncomeSourceCreate, IncomeSourceUpdate
from .tax import TaxProfile, TaxProfileUpdate, TaxEstimateResponse
from .transaction import TransactionType, Transaction
from .orm import Category, AccountHistoryRecord, AccountTermRecord, TransactionRecord, EquityGrantRecord
from .dashboard import DashboardPayload
