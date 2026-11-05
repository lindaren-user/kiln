/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
)

func enabledChannel(models, mapping string) Channel {
	channel := Channel{Status: common.ChannelStatusEnabled, Models: models}
	if mapping != "" {
		channel.ModelMapping = &mapping
	}
	return channel
}

func TestUpstreamNamesFollowASingleModelMapping(t *testing.T) {
	got := upstreamNamesForChannels([]Channel{
		enabledChannel("seedance2.5,plain", `{"seedance2.5":"seedance_v2.5"}`),
	})

	assert.Equal(t, "seedance_v2.5", got["seedance2.5"])
	assert.NotContains(t, got, "plain")
}

func TestUpstreamNamesFollowAMappingChain(t *testing.T) {
	got := upstreamNamesForChannels([]Channel{
		enabledChannel("public-name", `{"public-name":"hop","hop":"seedance_v2.5"}`),
	})

	assert.Equal(t, "seedance_v2.5", got["public-name"])
}

func TestUpstreamNamesStayUnsetWhenChannelsDisagree(t *testing.T) {
	got := upstreamNamesForChannels([]Channel{
		enabledChannel("seedance2.5", `{"seedance2.5":"seedance_v2.5"}`),
		enabledChannel("seedance2.5", `{"seedance2.5":"other-video"}`),
	})

	assert.NotContains(t, got, "seedance2.5")
}

func TestUpstreamNamesKeepAMappingWhenAnotherChannelPublishesTheName(t *testing.T) {
	got := upstreamNamesForChannels([]Channel{
		enabledChannel("seedance2.5", `{"seedance2.5":"seedance_v2.5"}`),
		enabledChannel("seedance2.5", ""),
	})

	assert.Equal(t, "seedance_v2.5", got["seedance2.5"])
}

func TestUpstreamNamesIgnoreDisabledChannels(t *testing.T) {
	disabled := enabledChannel("seedance2.5", `{"seedance2.5":"other-video"}`)
	disabled.Status = 0
	got := upstreamNamesForChannels([]Channel{
		enabledChannel("seedance2.5", `{"seedance2.5":"seedance_v2.5"}`),
		disabled,
	})

	assert.Equal(t, "seedance_v2.5", got["seedance2.5"])
}
