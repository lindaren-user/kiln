package service

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseAssetID(t *testing.T) {
	digest := strings.Repeat("a", 64)

	t.Run("accepts a digest", func(t *testing.T) {
		got, ok := parseAssetID(assetScheme + digest)
		require.True(t, ok)
		assert.Equal(t, digest, got)
	})

	t.Run("rejects anything else", func(t *testing.T) {
		for _, reference := range []string{
			digest,
			assetScheme + strings.ToUpper(digest),
			assetScheme + "not-a-digest",
			assetScheme + digest[:63],
			"https://cdn.example/" + digest,
		} {
			_, ok := parseAssetID(reference)
			assert.False(t, ok, reference)
		}
	})
}

func TestResolveAssetReferencesRewritesAssetValues(t *testing.T) {
	digest := strings.Repeat("b", 64)
	body := []byte(`{"model":"m","images":["assets://` + digest + `"],"prompt":"a cat","n":1}`)

	resolved, changed, err := ResolveAssetReferences(context.Background(), body, func(_ context.Context, reference string) (string, error) {
		require.Equal(t, assetScheme+digest, reference)
		return "https://cdn.example/" + digest + "?sig=a&b=c", nil
	})

	require.NoError(t, err)
	assert.True(t, changed)
	// The signed URL is JSON-encoded, so its `&` separator arrives escaped.
	assert.Equal(t, `{"model":"m","images":["https://cdn.example/`+digest+`?sig=a\`+`u0026b=c"],"prompt":"a cat","n":1}`, string(resolved))
}

func TestResolveAssetReferencesLeavesOtherBodiesAlone(t *testing.T) {
	body := []byte(`{"prompt":"assets are optional"}`)
	called := false

	resolved, changed, err := ResolveAssetReferences(context.Background(), body, func(context.Context, string) (string, error) {
		called = true
		return "", nil
	})

	require.NoError(t, err)
	assert.Equal(t, body, resolved)
	assert.False(t, changed)
	assert.False(t, called)
}

func TestResolveAssetReferencesRejectsMalformedReferences(t *testing.T) {
	body := []byte(`{"images":["assets://nope"]}`)
	called := false

	_, _, err := ResolveAssetReferences(context.Background(), body, func(context.Context, string) (string, error) {
		called = true
		return "https://cdn.example/never", nil
	})

	require.ErrorIs(t, err, ErrAssetInvalidReference)
	var referenceError *AssetReferenceError
	require.ErrorAs(t, err, &referenceError)
	assert.Equal(t, "assets://nope", referenceError.Reference)
	assert.False(t, called)
}

func TestResolveAssetReferencesReportsUnknownAssets(t *testing.T) {
	digest := strings.Repeat("c", 64)
	_, _, err := ResolveAssetReferences(context.Background(), []byte(`{"images":["assets://`+digest+`"]}`), func(context.Context, string) (string, error) {
		return "", ErrAssetNotFound
	})

	require.ErrorIs(t, err, ErrAssetNotFound)
	var referenceError *AssetReferenceError
	require.ErrorAs(t, err, &referenceError)
	assert.Equal(t, assetScheme+digest, referenceError.Reference)
}
