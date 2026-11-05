package model

import (
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
)

// TaskAliasTarget is one mapping-derived alias after cross-channel aggregation.
// Declared is empty when the same plugin resolves the alias to more than one
// declared tail (display-only; pin is disabled).
type TaskAliasTarget struct {
	Alias     string
	Declared  string
	PluginKey string
}

type taskAliasView struct {
	generation uint64
	expiresAt  time.Time
	byFold     map[string]TaskAliasTarget
}

const taskAliasViewTTL = 60 * time.Second

var (
	taskAliasViewPtr   atomic.Pointer[taskAliasView]
	taskAliasRebuildMu sync.Mutex
)

// ResolveTaskModelAlias returns the mapping-derived alias target for name
// (exact or ASCII-folded). g is the caller's routing generation: a Number
// mismatch or TTL expiry rebuilds the view against that generation.
func ResolveTaskModelAlias(g *jsplugin.RoutingGeneration, name string) (TaskAliasTarget, bool) {
	if g == nil || name == "" {
		return TaskAliasTarget{}, false
	}
	view := loadFreshTaskAliasView(g)
	if view == nil {
		return TaskAliasTarget{}, false
	}
	target, ok := view.byFold[jsplugin.ASCIIFold(name)]
	return target, ok
}

// ResolveTaskPluginModel matches a client model name against a plugin's
// declared models as the host protocols do: a case variant is served under
// the declared spelling, a channel alias under the alias. declared is the
// model of models the name stands for. A nil g matches exact names only.
func ResolveTaskPluginModel(g *jsplugin.RoutingGeneration, name string, models []string) (served, declared string, ok bool) {
	if slices.Contains(models, name) {
		return name, name, true
	}
	if canonical, found := g.CanonicalModel(name); found {
		if !slices.Contains(models, canonical) {
			return "", "", false
		}
		return canonical, canonical, true
	}
	target, found := ResolveTaskModelAlias(g, name)
	if !found || target.Declared == "" || !slices.Contains(models, target.Declared) {
		return "", "", false
	}
	return target.Alias, target.Declared, true
}

func loadFreshTaskAliasView(g *jsplugin.RoutingGeneration) *taskAliasView {
	view := taskAliasViewPtr.Load()
	if taskAliasViewFresh(view, g.Number) {
		return view
	}
	taskAliasRebuildMu.Lock()
	defer taskAliasRebuildMu.Unlock()
	view = taskAliasViewPtr.Load()
	if taskAliasViewFresh(view, g.Number) {
		return view
	}
	rebuilt := buildTaskAliasView(g)
	taskAliasViewPtr.Store(rebuilt)
	return rebuilt
}

func taskAliasViewFresh(view *taskAliasView, generation uint64) bool {
	return view != nil && view.generation == generation && time.Now().Before(view.expiresAt)
}

func rebuildTaskAliasView() {
	taskAliasRebuildMu.Lock()
	defer taskAliasRebuildMu.Unlock()
	taskAliasViewPtr.Store(buildTaskAliasView(jsplugin.DefaultRegistry.Generation()))
}

type taskAliasDraft struct {
	spellings []string
	byPlugin  map[string]map[string]struct{}
}

func buildTaskAliasView(generation *jsplugin.RoutingGeneration) *taskAliasView {
	genNum := uint64(0)
	if generation != nil {
		genNum = generation.Number
	}
	view := &taskAliasView{
		generation: genNum,
		expiresAt:  time.Now().Add(taskAliasViewTTL),
		byFold:     make(map[string]TaskAliasTarget),
	}
	if DB == nil {
		return view
	}

	var channels []Channel
	err := DB.Select("id", "type", "models", "model_mapping").
		Where("status = ?", common.ChannelStatusEnabled).
		Find(&channels).Error
	if err != nil {
		common.SysError(common.LogText("rebuild task alias view: %s", err.Error()))
		return view
	}

	drafts := make(map[string]*taskAliasDraft)
	for i := range channels {
		channel := &channels[i]
		mappingJSON := channel.GetModelMapping()
		if mappingJSON == "" || mappingJSON == "{}" {
			continue
		}
		modelMap := make(map[string]string)
		if err := common.UnmarshalJsonStr(mappingJSON, &modelMap); err != nil {
			common.SysError(common.LogText("task alias view: channel %d model_mapping: %s", channel.Id, err.Error()))
			continue
		}
		inModels := make(map[string]struct{})
		for _, modelName := range channel.GetModels() {
			inModels[modelName] = struct{}{}
		}
		for alias, mapped := range modelMap {
			if mapped == "" {
				continue
			}
			if _, exposed := inModels[alias]; !exposed {
				continue
			}
			if _, declared := generation.CanonicalModel(alias); declared {
				continue
			}
			tail, cyclic := followChannelModelMapping(modelMap, alias)
			if cyclic {
				common.SysError(common.LogText("task alias mapping cycle dropped: channel=%d key=%q", channel.Id, alias))
				continue
			}
			declared, ok := generation.CanonicalModel(tail)
			if !ok {
				continue
			}
			plugin, ok := generation.GetByModel(declared)
			if !ok {
				continue
			}
			fold := jsplugin.ASCIIFold(alias)
			draft := drafts[fold]
			if draft == nil {
				draft = &taskAliasDraft{byPlugin: make(map[string]map[string]struct{})}
				drafts[fold] = draft
			}
			draft.spellings = append(draft.spellings, alias)
			declareds := draft.byPlugin[plugin.Meta.Key]
			if declareds == nil {
				declareds = make(map[string]struct{})
				draft.byPlugin[plugin.Meta.Key] = declareds
			}
			declareds[declared] = struct{}{}
		}
	}

	for _, draft := range drafts {
		alias := draft.spellings[0]
		for _, spelling := range draft.spellings[1:] {
			if spelling < alias {
				alias = spelling
			}
		}
		if len(draft.byPlugin) != 1 {
			pluginKeys := make([]string, 0, len(draft.byPlugin))
			for key := range draft.byPlugin {
				pluginKeys = append(pluginKeys, key)
			}
			common.SysLog(common.LogText("task model alias %q dropped: maps to multiple plugins %v", alias, pluginKeys))
			continue
		}
		var pluginKey, declared string
		for key, declareds := range draft.byPlugin {
			pluginKey = key
			if len(declareds) == 1 {
				for name := range declareds {
					declared = name
				}
			}
		}
		view.byFold[jsplugin.ASCIIFold(alias)] = TaskAliasTarget{
			Alias:     alias,
			Declared:  declared,
			PluginKey: pluginKey,
		}
	}
	return view
}

// followChannelModelMapping walks one channel's mapping the same way
// ModelMappedHelper does: visited-set cycle detection, self-map stops at
// the current hop, a non-self cycle is reported to the caller.
func followChannelModelMapping(modelMap map[string]string, start string) (string, bool) {
	current := start
	visited := map[string]bool{current: true}
	for {
		mapped, exists := modelMap[current]
		if !exists || mapped == "" {
			return current, false
		}
		if visited[mapped] {
			if mapped == current {
				return current, false
			}
			return "", true
		}
		visited[mapped] = true
		current = mapped
	}
}

var (
	publicUpstreamMu    sync.Mutex
	publicUpstreamNames map[string]string
	publicUpstreamUntil time.Time
)

// PublicModelUpstreams maps a published model name to its mapped upstream name.
// A name that is not a model-mapping key is absent, so callers look up
// parameters by the published name. Distinct upstreams leave the name absent.
// The result is cached briefly with the task-alias view.
func PublicModelUpstreams() map[string]string {
	publicUpstreamMu.Lock()
	defer publicUpstreamMu.Unlock()
	if publicUpstreamNames != nil && time.Now().Before(publicUpstreamUntil) {
		return publicUpstreamNames
	}
	publicUpstreamNames = loadPublicModelUpstreams()
	publicUpstreamUntil = time.Now().Add(taskAliasViewTTL)
	return publicUpstreamNames
}

func loadPublicModelUpstreams() map[string]string {
	if DB == nil {
		return map[string]string{}
	}
	var channels []Channel
	err := DB.Select("status", "models", "model_mapping").
		Where("status = ?", common.ChannelStatusEnabled).
		Find(&channels).Error
	if err != nil {
		common.SysError(common.LogText("public model upstreams: %s", err.Error()))
		return map[string]string{}
	}
	return upstreamNamesForChannels(channels)
}

// upstreamNamesForChannels keeps a published name only when model_mapping
// renames it. An unmapped name is omitted. A cyclic mapping is ignored. When
// enabled channels map one name to different upstreams, that name is omitted.
func upstreamNamesForChannels(channels []Channel) map[string]string {
	upstreams := make(map[string]string)
	conflict := make(map[string]bool)
	for i := range channels {
		channel := &channels[i]
		if channel.Status != common.ChannelStatusEnabled {
			continue
		}
		raw := strings.TrimSpace(channel.GetModelMapping())
		if raw == "" || raw == "{}" {
			continue
		}
		var mapping map[string]string
		if err := common.UnmarshalJsonStr(raw, &mapping); err != nil {
			continue
		}
		for _, name := range channel.GetModels() {
			name = strings.TrimSpace(name)
			if name == "" || mapping[name] == "" || conflict[name] {
				continue
			}
			resolved, cyclic := followChannelModelMapping(mapping, name)
			if cyclic || resolved == "" || resolved == name {
				continue
			}
			previous, seen := upstreams[name]
			if seen && previous != resolved {
				delete(upstreams, name)
				conflict[name] = true
				continue
			}
			upstreams[name] = resolved
		}
	}
	return upstreams
}
