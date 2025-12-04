/**
 * Campaign Blueprint Panel
 *
 * UI component for creating and managing campaign blueprints
 * in the Mod Editor. Provides visual interface for story-first
 * campaign creation.
 */

import React, { Component } from 'react';
import {
  CampaignBlueprint,
  Act,
  Chapter,
  Location,
  Character,
  Quest,
  QuestObjective,
  STORY_TEMPLATES,
  DUNGEON_THEMES,
  CHARACTER_ROLES,
} from './CampaignBlueprint';
import {
  MONSTER_REGISTRY,
  NPC_REGISTRY,
  AssetSearch,
} from './AssetRegistry';
import { CampaignBuilder, QuickCampaign } from './CampaignBuilder';
import { BuildProgressPanel, buildProgress, BUILD_STATUS } from './CampaignBuildProgress';

/**
 * Main Campaign Blueprint Panel
 */
export class CampaignBlueprintPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      blueprint: null,
      activeTab: 'overview', // overview, story, world, characters, quests, build
      expandedAct: null,
      searchQuery: '',
      searchType: 'monsters',
      searchResults: [],
      showQuickCreate: false,
      // Build state
      isBuilding: false,
      buildResult: null,
      buildError: null,
    };

    this.builder = new CampaignBuilder({
      useProgressEmitter: true,
    });
  }

  componentDidMount() {
    // Check if executor already has a blueprint
    if (this.props.executor?.campaignBlueprint) {
      this.setState({ blueprint: this.props.executor.campaignBlueprint });
    }
  }

  /**
   * Create new blueprint
   */
  createBlueprint = (title, template = 'custom') => {
    const templateConfig = STORY_TEMPLATES[template.toUpperCase()];

    const blueprint = new CampaignBlueprint({
      id: `campaign_${Date.now()}`,
      story: {
        title: title || 'New Campaign',
        description: templateConfig?.description || 'A dark adventure awaits...',
        template,
        acts: [],
      },
    });

    // Initialize with default 4 acts
    const themes = ['cathedral', 'catacombs', 'caves', 'hell'];
    for (let i = 0; i < 4; i++) {
      blueprint.story.addAct(new Act({
        id: `act_${i + 1}`,
        number: i + 1,
        title: `Act ${i + 1}`,
        theme: themes[i],
        levelRange: [(i * 4) + 1, (i + 1) * 4],
      }));
    }

    this.setState({ blueprint });
    if (this.props.executor) {
      this.props.executor.setCampaignBlueprint(blueprint);
    }
    if (this.props.onBlueprintChange) {
      this.props.onBlueprintChange(blueprint);
    }
  };

  /**
   * Generate quick campaign
   */
  generateQuickCampaign = (type) => {
    let blueprint;
    switch (type) {
      case 'horror':
        blueprint = QuickCampaign.horror();
        break;
      case 'epic':
        blueprint = QuickCampaign.epic();
        break;
      case 'mystery':
        blueprint = QuickCampaign.mystery();
        break;
      default:
        blueprint = QuickCampaign.classic();
    }

    this.setState({ blueprint, showQuickCreate: false });
    if (this.props.executor) {
      this.props.executor.setCampaignBlueprint(blueprint);
    }
    if (this.props.onBlueprintChange) {
      this.props.onBlueprintChange(blueprint);
    }
  };

  /**
   * Search assets
   */
  searchAssets = () => {
    const { searchQuery, searchType } = this.state;
    let results = [];

    const criteria = searchQuery ? { name: searchQuery } : {};

    switch (searchType) {
      case 'monsters':
        results = AssetSearch.searchMonsters(criteria);
        break;
      case 'npcs':
        results = AssetSearch.searchNPCs(criteria);
        break;
      case 'items':
        results = AssetSearch.searchItems(criteria);
        break;
      case 'objects':
        results = AssetSearch.searchObjects(criteria);
        break;
      default:
        break;
    }

    this.setState({ searchResults: results.slice(0, 20) });
  };

  /**
   * Add character from search results
   */
  addCharacterFromResult = (result) => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const character = new Character({
      id: `char_${result.key}_${Date.now()}`,
      name: result.name,
      role: result.category === 'boss' ? 'boss' : 'minion',
      baseAsset: result.key,
      baseData: result,
    });

    blueprint.characters.addCharacter(character);
    this.forceUpdate();
  };

  /**
   * Add act
   */
  addAct = () => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const themes = ['cathedral', 'catacombs', 'caves', 'hell'];
    const actNum = blueprint.story.acts.length + 1;

    blueprint.story.addAct(new Act({
      id: `act_${actNum}`,
      number: actNum,
      title: `Act ${actNum}`,
      theme: themes[(actNum - 1) % themes.length],
      levelRange: [((actNum - 1) * 4) + 1, actNum * 4],
    }));

    this.forceUpdate();
  };

  /**
   * Add chapter to act
   */
  addChapter = (actNumber) => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const act = blueprint.story.acts.find(a => a.number === actNumber);
    if (!act) return;

    const chapterNum = act.chapters.length + 1;
    act.addChapter(new Chapter({
      id: `act${actNumber}_ch${chapterNum}`,
      number: chapterNum,
      title: `Chapter ${chapterNum}`,
      description: '',
    }));

    this.forceUpdate();
  };

  /**
   * Add location
   */
  addLocation = (type = 'dungeon') => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const locNum = blueprint.world.locations.length + 1;
    blueprint.world.addLocation(new Location({
      id: `loc_${locNum}`,
      name: `Location ${locNum}`,
      type,
      theme: 'cathedral',
    }));

    this.forceUpdate();
  };

  /**
   * Add quest
   */
  addQuest = (type = 'main') => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const questNum = blueprint.quests.getAllQuests().length + 1;
    blueprint.quests.addQuest(new Quest({
      id: `quest_${questNum}`,
      name: `Quest ${questNum}`,
      description: 'Quest description...',
      type,
      objectives: [new QuestObjective({
        id: 'obj_1',
        description: 'Complete objective',
        type: 'generic',
      })],
    }));

    this.forceUpdate();
  };

  /**
   * Export blueprint
   */
  exportBlueprint = () => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    const data = JSON.stringify(blueprint.export(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.story.title.replace(/\s+/g, '_').toLowerCase()}_blueprint.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Import blueprint
   */
  importBlueprint = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const blueprint = CampaignBlueprint.import(data);
        this.setState({ blueprint });
        if (this.props.executor) {
          this.props.executor.setCampaignBlueprint(blueprint);
        }
        if (this.props.onBlueprintChange) {
          this.props.onBlueprintChange(blueprint);
        }
      } catch (err) {
        console.error('Failed to import blueprint:', err);
        alert('Failed to import blueprint: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  /**
   * Build campaign from blueprint
   */
  buildCampaign = async () => {
    const { blueprint } = this.state;
    if (!blueprint) return;

    this.setState({
      isBuilding: true,
      buildResult: null,
      buildError: null,
      activeTab: 'build',
    });

    try {
      const result = await this.builder.build(blueprint);

      this.setState({
        isBuilding: false,
        buildResult: result,
      });

      // Notify parent of generated levels
      if (this.props.onBuildComplete) {
        this.props.onBuildComplete(result);
      }

      // Add levels to executor's modified files
      if (this.props.executor && result.levels) {
        for (const [path, dunData] of result.levels) {
          this.props.executor.modifiedFiles.set(path, {
            type: 'dun',
            data: dunData,
            modified: Date.now(),
            isNew: true,
          });
        }
      }

      console.log('[CampaignBlueprintPanel] Build complete:', result);
    } catch (error) {
      console.error('[CampaignBlueprintPanel] Build failed:', error);
      this.setState({
        isBuilding: false,
        buildError: error.message,
      });
    }
  };

  /**
   * Build and play - builds then starts the game
   */
  buildAndPlay = async () => {
    await this.buildCampaign();

    // If successful and onPlayMod is provided, trigger it
    if (!this.state.buildError && this.props.onPlayMod) {
      this.props.onPlayMod(this.state.buildResult);
    }
  };

  /**
   * Render build tab
   */
  renderBuild() {
    const { blueprint, isBuilding, buildResult, buildError } = this.state;

    return (
      <div className="blueprint-build">
        <div className="build-header">
          <h4>Build Campaign</h4>
          <p>Generate all levels, place monsters, and prepare for play</p>
        </div>

        {/* Build Actions */}
        <div className="build-actions">
          <button
            onClick={this.buildCampaign}
            disabled={!blueprint || isBuilding}
            className="btn btn-primary btn-large"
          >
            {isBuilding ? 'Building...' : 'Build Campaign'}
          </button>
          <button
            onClick={this.buildAndPlay}
            disabled={!blueprint || isBuilding}
            className="btn btn-success btn-large"
          >
            {isBuilding ? 'Building...' : 'Build & Play'}
          </button>
        </div>

        {/* Progress Panel */}
        <div className="build-progress-container">
          <BuildProgressPanel />
        </div>

        {/* Build Result */}
        {buildResult && (
          <div className="build-result success">
            <h5>Build Complete</h5>
            <div className="result-stats">
              <span>Levels: {buildResult.levels?.size || 0}</span>
              <span>Triggers: {buildResult.triggers?.length || 0}</span>
              <span>Warnings: {buildResult.warnings?.length || 0}</span>
            </div>
            {buildResult.levels?.size > 0 && (
              <div className="generated-files">
                <h6>Generated Files:</h6>
                <ul>
                  {Array.from(buildResult.levels?.keys() || []).slice(0, 5).map(path => (
                    <li key={path}>{path}</li>
                  ))}
                  {(buildResult.levels?.size || 0) > 5 && (
                    <li>...and {buildResult.levels.size - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Build Error */}
        {buildError && (
          <div className="build-result error">
            <h5>Build Failed</h5>
            <p>{buildError}</p>
          </div>
        )}
      </div>
    );
  }

  /**
   * Render overview tab
   */
  renderOverview() {
    const { blueprint, showQuickCreate } = this.state;

    if (!blueprint) {
      return (
        <div className="blueprint-empty">
          <h4>No Campaign Blueprint</h4>
          <p>Create a new campaign blueprint or import an existing one.</p>
          <div className="blueprint-actions">
            <button
              onClick={() => this.createBlueprint('New Campaign')}
              className="btn btn-primary"
            >
              Create New Blueprint
            </button>
            <button
              onClick={() => this.setState({ showQuickCreate: true })}
              className="btn btn-secondary"
            >
              Quick Create
            </button>
            <label className="btn btn-outline">
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={this.importBlueprint}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {showQuickCreate && (
            <div className="quick-create-options">
              <h5>Quick Campaign Templates</h5>
              <div className="template-grid">
                <button onClick={() => this.generateQuickCampaign('classic')}>
                  <strong>Classic</strong>
                  <span>Traditional Diablo descent</span>
                </button>
                <button onClick={() => this.generateQuickCampaign('horror')}>
                  <strong>Horror</strong>
                  <span>Psychological terror</span>
                </button>
                <button onClick={() => this.generateQuickCampaign('epic')}>
                  <strong>Epic</strong>
                  <span>Grand scale adventure</span>
                </button>
                <button onClick={() => this.generateQuickCampaign('mystery')}>
                  <strong>Mystery</strong>
                  <span>Uncover dark secrets</span>
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Safe access to methods that might not exist on plain objects
    const validation = typeof blueprint.validate === 'function'
      ? blueprint.validate()
      : { valid: true, errors: [], warnings: [] };

    const characterCount = typeof blueprint.characters?.getAllCharacters === 'function'
      ? blueprint.characters.getAllCharacters().length
      : (blueprint.characters?.npcs?.length || 0) +
        (blueprint.characters?.enemies?.length || 0) +
        (blueprint.characters?.bosses?.length || 0);

    const questCount = typeof blueprint.quests?.getAllQuests === 'function'
      ? blueprint.quests.getAllQuests().length
      : (blueprint.quests?.main?.length || 0) + (blueprint.quests?.side?.length || 0);

    const actCount = blueprint.story?.acts?.length || 0;
    const locationCount = blueprint.world?.locations?.length ||
      (blueprint.world?.locations instanceof Map ? blueprint.world.locations.size : 0);

    return (
      <div className="blueprint-overview">
        <div className="overview-header">
          <input
            type="text"
            value={blueprint.story?.title || 'Untitled Campaign'}
            onChange={(e) => {
              if (blueprint.story) {
                blueprint.story.title = e.target.value;
              }
              this.forceUpdate();
            }}
            className="campaign-title-input"
          />
          <div className="overview-actions">
            <button onClick={this.exportBlueprint} className="btn btn-small">
              Export
            </button>
          </div>
        </div>

        <div className="overview-stats">
          <div className="stat-card">
            <span className="stat-value">{actCount}</span>
            <span className="stat-label">Acts</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{locationCount}</span>
            <span className="stat-label">Locations</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{characterCount}</span>
            <span className="stat-label">Characters</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{questCount}</span>
            <span className="stat-label">Quests</span>
          </div>
        </div>

        <div className="validation-summary">
          <h5>Validation</h5>
          {validation.valid ? (
            <span className="validation-valid">Blueprint is valid</span>
          ) : (
            <div className="validation-errors">
              {validation.errors.map((err, i) => (
                <div key={i} className="validation-error">{err}</div>
              ))}
            </div>
          )}
          {validation.warnings?.length > 0 && (
            <div className="validation-warnings">
              {validation.warnings.map((warn, i) => (
                <div key={i} className="validation-warning">{warn}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /**
   * Render story tab
   */
  renderStory() {
    const { blueprint, expandedAct } = this.state;
    if (!blueprint) return null;

    return (
      <div className="blueprint-story">
        <div className="story-description">
          <label>Campaign Description</label>
          <textarea
            value={blueprint.story.description}
            onChange={(e) => {
              blueprint.story.description = e.target.value;
              this.forceUpdate();
            }}
            rows={3}
          />
        </div>

        <div className="acts-list">
          <div className="acts-header">
            <h4>Acts</h4>
            <button onClick={this.addAct} className="btn btn-small">+ Add Act</button>
          </div>

          {blueprint.story.acts.map(act => (
            <div key={act.id} className="act-card">
              <div
                className="act-header"
                onClick={() => this.setState({
                  expandedAct: expandedAct === act.id ? null : act.id,
                })}
              >
                <span className="act-number">Act {act.number}</span>
                <input
                  type="text"
                  value={act.title}
                  onChange={(e) => {
                    act.title = e.target.value;
                    this.forceUpdate();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <select
                  value={act.theme}
                  onChange={(e) => {
                    act.theme = e.target.value;
                    this.forceUpdate();
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {Object.keys(DUNGEON_THEMES).map(theme => (
                    <option key={theme} value={theme.toLowerCase()}>
                      {theme}
                    </option>
                  ))}
                </select>
                <span className="expand-icon">{expandedAct === act.id ? '▼' : '▶'}</span>
              </div>

              {expandedAct === act.id && (
                <div className="act-details">
                  <textarea
                    placeholder="Act description..."
                    value={act.description}
                    onChange={(e) => {
                      act.description = e.target.value;
                      this.forceUpdate();
                    }}
                    rows={2}
                  />

                  <div className="chapters-section">
                    <div className="chapters-header">
                      <span>Chapters ({act.chapters.length})</span>
                      <button
                        onClick={() => this.addChapter(act.number)}
                        className="btn btn-tiny"
                      >
                        +
                      </button>
                    </div>
                    {act.chapters.map(ch => (
                      <div key={ch.id} className="chapter-item">
                        <input
                          type="text"
                          value={ch.title}
                          onChange={(e) => {
                            ch.title = e.target.value;
                            this.forceUpdate();
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /**
   * Render world tab
   */
  renderWorld() {
    const { blueprint } = this.state;
    if (!blueprint) return null;

    return (
      <div className="blueprint-world">
        <div className="locations-header">
          <h4>Locations</h4>
          <div>
            <button onClick={() => this.addLocation('dungeon')} className="btn btn-small">
              + Dungeon
            </button>
            <button onClick={() => this.addLocation('town')} className="btn btn-small">
              + Town
            </button>
          </div>
        </div>

        <div className="locations-list">
          {blueprint.world.locations.map(loc => (
            <div key={loc.id} className="location-card">
              <div className="location-header">
                <span className={`location-type type-${loc.type}`}>{loc.type}</span>
                <input
                  type="text"
                  value={loc.name}
                  onChange={(e) => {
                    loc.name = e.target.value;
                    this.forceUpdate();
                  }}
                />
                <select
                  value={loc.theme}
                  onChange={(e) => {
                    loc.theme = e.target.value;
                    this.forceUpdate();
                  }}
                >
                  {Object.keys(DUNGEON_THEMES).map(theme => (
                    <option key={theme} value={theme.toLowerCase()}>
                      {theme}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Location description..."
                value={loc.description || ''}
                onChange={(e) => {
                  loc.description = e.target.value;
                  this.forceUpdate();
                }}
                rows={2}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /**
   * Render characters tab
   */
  renderCharacters() {
    const { blueprint, searchQuery, searchType, searchResults } = this.state;
    if (!blueprint) return null;

    return (
      <div className="blueprint-characters">
        {/* Asset Search */}
        <div className="asset-search">
          <h5>Search Game Assets</h5>
          <div className="search-controls">
            <select
              value={searchType}
              onChange={(e) => this.setState({ searchType: e.target.value })}
            >
              <option value="monsters">Monsters</option>
              <option value="npcs">NPCs</option>
              <option value="items">Items</option>
              <option value="objects">Objects</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => this.setState({ searchQuery: e.target.value })}
              placeholder="Search..."
            />
            <button onClick={this.searchAssets} className="btn btn-small">
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(result => (
                <div key={result.key} className="search-result">
                  <span className="result-name">{result.name}</span>
                  <span className="result-tags">
                    {result.tags?.slice(0, 3).join(', ')}
                  </span>
                  {searchType === 'monsters' && (
                    <button
                      onClick={() => this.addCharacterFromResult(result)}
                      className="btn btn-tiny"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Character Lists */}
        <div className="characters-lists">
          <div className="character-section">
            <h5>NPCs ({blueprint.characters.npcs.length})</h5>
            {blueprint.characters.npcs.map(char => (
              <div key={char.id} className="character-item">
                <span className="char-role">{char.role}</span>
                <span className="char-name">{char.name}</span>
              </div>
            ))}
          </div>

          <div className="character-section">
            <h5>Bosses ({blueprint.characters.bosses.length})</h5>
            {blueprint.characters.bosses.map(char => (
              <div key={char.id} className="character-item boss">
                <span className="char-name">{char.name}</span>
                {char.baseAsset && (
                  <span className="char-base">({char.baseAsset})</span>
                )}
              </div>
            ))}
          </div>

          <div className="character-section">
            <h5>Enemies ({blueprint.characters.enemies.length})</h5>
            {blueprint.characters.enemies.map(char => (
              <div key={char.id} className="character-item">
                <span className="char-name">{char.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /**
   * Render quests tab
   */
  renderQuests() {
    const { blueprint } = this.state;
    if (!blueprint) return null;

    return (
      <div className="blueprint-quests">
        <div className="quests-header">
          <h4>Quests</h4>
          <div>
            <button onClick={() => this.addQuest('main')} className="btn btn-small">
              + Main Quest
            </button>
            <button onClick={() => this.addQuest('side')} className="btn btn-small">
              + Side Quest
            </button>
          </div>
        </div>

        <div className="quests-sections">
          <div className="quest-section">
            <h5>Main Quests ({blueprint.quests.main.length})</h5>
            {blueprint.quests.main.map(quest => (
              <div key={quest.id} className="quest-card">
                <input
                  type="text"
                  value={quest.name}
                  onChange={(e) => {
                    quest.name = e.target.value;
                    this.forceUpdate();
                  }}
                  className="quest-name"
                />
                <textarea
                  value={quest.description}
                  onChange={(e) => {
                    quest.description = e.target.value;
                    this.forceUpdate();
                  }}
                  rows={2}
                  placeholder="Quest description..."
                />
                <div className="quest-objectives">
                  <span className="objectives-label">
                    {quest.objectives.length} objective(s)
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="quest-section">
            <h5>Side Quests ({blueprint.quests.side.length})</h5>
            {blueprint.quests.side.map(quest => (
              <div key={quest.id} className="quest-card side">
                <input
                  type="text"
                  value={quest.name}
                  onChange={(e) => {
                    quest.name = e.target.value;
                    this.forceUpdate();
                  }}
                  className="quest-name"
                />
                <textarea
                  value={quest.description}
                  onChange={(e) => {
                    quest.description = e.target.value;
                    this.forceUpdate();
                  }}
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const { activeTab, blueprint, isBuilding } = this.state;

    return (
      <div className="campaign-blueprint-panel">
        <div className="blueprint-tabs">
          <button
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => this.setState({ activeTab: 'overview' })}
          >
            Overview
          </button>
          <button
            className={activeTab === 'story' ? 'active' : ''}
            onClick={() => this.setState({ activeTab: 'story' })}
            disabled={!blueprint}
          >
            Story
          </button>
          <button
            className={activeTab === 'world' ? 'active' : ''}
            onClick={() => this.setState({ activeTab: 'world' })}
            disabled={!blueprint}
          >
            World
          </button>
          <button
            className={activeTab === 'characters' ? 'active' : ''}
            onClick={() => this.setState({ activeTab: 'characters' })}
            disabled={!blueprint}
          >
            Characters
          </button>
          <button
            className={activeTab === 'quests' ? 'active' : ''}
            onClick={() => this.setState({ activeTab: 'quests' })}
            disabled={!blueprint}
          >
            Quests
          </button>
          <button
            className={`${activeTab === 'build' ? 'active' : ''} ${isBuilding ? 'building' : ''}`}
            onClick={() => this.setState({ activeTab: 'build' })}
            disabled={!blueprint}
          >
            {isBuilding ? 'Building...' : 'Build'}
          </button>
        </div>

        <div className="blueprint-content">
          {activeTab === 'overview' && this.renderOverview()}
          {activeTab === 'story' && this.renderStory()}
          {activeTab === 'world' && this.renderWorld()}
          {activeTab === 'characters' && this.renderCharacters()}
          {activeTab === 'quests' && this.renderQuests()}
          {activeTab === 'build' && this.renderBuild()}
        </div>
      </div>
    );
  }
}

export default CampaignBlueprintPanel;
