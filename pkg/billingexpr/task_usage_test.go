package billingexpr

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTaskFixedPriceIgnoresFactsAndUsesRequestQuotaConversion(t *testing.T) {
	expression := `tier("base", fixed(8.5))`
	snap := &BillingSnapshot{ExprString: expression, ExprHash: ExprHashString(expression), GroupRatio: 2, QuotaPerUnit: 500000, ExprVersion: 1, TaskUsageBilling: true}

	first, err := ComputeTieredQuotaWithRequest(snap, TokenParams{}, RequestInput{Usage: map[string]any{"seconds": 1.0}})
	require.NoError(t, err)
	assert.Equal(t, BillingUnitRequest, first.BillingUnit)
	require.NotNil(t, first.FixedPrice)
	assert.Equal(t, 8.5, *first.FixedPrice)
	assert.Equal(t, 8_500_000, first.ActualQuotaAfterGroup)

	// Usage facts do not affect a fixed task price.
	second, err := ComputeTieredQuotaWithRequest(snap, TokenParams{}, RequestInput{Usage: map[string]any{"seconds": 60.0}})
	require.NoError(t, err)
	assert.Equal(t, first.ActualQuotaAfterGroup, second.ActualQuotaAfterGroup)
}

func TestTaskUsageExpressionUsesFactsAndTaskQuotaConversion(t *testing.T) {
	expression := `tier("1080p", u("seconds") * (u("resolution") == "1080p" ? 0.4 : 0.2))`
	cost, trace, err := RunExprWithRequest(expression, TokenParams{}, RequestInput{Usage: map[string]any{"seconds": 10.0, "resolution": "1080p"}})
	require.NoError(t, err)
	assert.Equal(t, 4.0, cost)
	assert.Equal(t, "1080p", trace.MatchedTier)
	result, err := ComputeTieredQuotaWithRequest(&BillingSnapshot{ExprString: expression, ExprHash: ExprHashString(expression), GroupRatio: 2, QuotaPerUnit: 500000, ExprVersion: 1, TaskUsageBilling: true}, TokenParams{}, RequestInput{Usage: map[string]any{"seconds": 10.0, "resolution": "1080p"}})
	require.NoError(t, err)
	assert.Equal(t, 4_000_000, result.ActualQuotaAfterGroup)
}
