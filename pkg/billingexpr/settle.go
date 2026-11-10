package billingexpr

import (
	"github.com/QuantumNous/new-api/common"
)

// QuotaConversion converts raw expression output to quota before the group
// ratio. Task usage expressions return USD directly, while fixed per-request
// prices (and every non-task expression) carry the v1 ×1e6 scaling, so the
// same fixed amount means the same money in both billing entrances.
func QuotaConversion(exprOutput float64, trace TraceResult, taskUsageBilling bool, quotaPerUnit float64) float64 {
	if taskUsageBilling && trace.BillingUnit != BillingUnitRequest {
		return exprOutput * quotaPerUnit
	}
	return exprOutput / 1_000_000 * quotaPerUnit
}

// ComputeTieredQuota runs the Expr from a frozen BillingSnapshot against
// actual token counts and returns the settlement result.
func ComputeTieredQuota(snap *BillingSnapshot, params TokenParams) (TieredResult, error) {
	return ComputeTieredQuotaWithRequest(snap, params, RequestInput{})
}

func ComputeTieredQuotaWithRequest(snap *BillingSnapshot, params TokenParams, request RequestInput) (TieredResult, error) {
	cost, trace, err := RunExprByHashWithRequest(snap.ExprString, snap.ExprHash, params, request)
	if err != nil {
		return TieredResult{}, err
	}

	quotaBeforeGroup := QuotaConversion(cost, trace, snap.TaskUsageBilling, snap.QuotaPerUnit)
	afterGroup, clamp := common.QuotaRoundChecked(quotaBeforeGroup * snap.GroupRatio)
	crossed := trace.MatchedTier != snap.EstimatedTier

	result := TieredResult{
		ImageCount:             trace.ImageCount,
		BillingUnit:            trace.BillingUnit,
		FixedPrice:             trace.FixedPrice,
		ActualQuotaBeforeGroup: quotaBeforeGroup,
		ActualQuotaAfterGroup:  afterGroup,
		MatchedTier:            trace.MatchedTier,
		RequestRules:           trace.RequestRules,
		CrossedTier:            crossed,
		Clamp:                  clamp,
	}
	if trace.BillingUnit == BillingUnitToken && UsedVarsByHash(snap.ExprString, snap.ExprHash)["img_cr"] {
		result.BillingTokens = &params
	}
	return result, nil
}
