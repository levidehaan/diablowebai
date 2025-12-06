/**
 * MPQ Generation with Real Mock Generators
 * 
 * Uses the actual MockLevelGenerator and MockCampaignGenerator
 * to test the full AI → MPQ pipeline.
 * 
 * Run with: npm run test:neural -- --testPathPattern=mpq-real-mocks
 */

// This test imports the actual mock generators from the codebase
describe('MPQ Generation with Real Mocks', () => {
  let MockLevelGenerator, MockCampaignGenerator, convertCampaign;

  beforeAll(async () => {
    jest.resetModules();
    const levelGen = await import('../src/neural/LevelGenerator.js');
    const campaignGen = await import('../src/neural/CampaignGenerator.js');
    const converter = await import('../src/neural/CampaignConverter.js');
    
    MockLevelGenerator = levelGen.MockLevelGenerator;
    MockCampaignGenerator = campaignGen.MockCampaignGenerator;
    convertCampaign = converter.convertCampaign;
  });

  test('MockCampaignGenerator produces valid campaign', () => {
    const campaign = MockCampaignGenerator.generateCampaign('CLASSIC', 12345);
    
    expect(campaign).toBeDefined();
    expect(campaign.id).toContain('campaign_');
    expect(campaign.name).toBeDefined();
    expect(campaign.acts.length).toBeGreaterThan(0);
    
    // Verify act structure
    const act = campaign.acts[0];
    expect(act.levels).toBeDefined();
    expect(act.levels.length).toBeGreaterThan(0);
  });

  test('MockLevelGenerator produces 40x40 grid', () => {
    const level = MockLevelGenerator.generate(1, 1);
    
    expect(level.grid).toBeDefined();
    expect(level.grid.length).toBe(40);
    expect(level.grid[0].length).toBe(40);
    expect(level.rooms).toBeDefined();
  });

  test('Campaign converts to DUN files', () => {
    const campaign = MockCampaignGenerator.generateCampaign('CLASSIC', 54321);
    const result = convertCampaign(campaign, { autoFix: true });
    
    expect(result.success).toBe(true);
    expect(result.levels.length).toBeGreaterThan(0);
    expect(result.files.size).toBeGreaterThan(0);
    
    // Verify DUN files are created
    for (const [path, buffer] of result.files) {
      expect(path).toMatch(/\.dun$/);
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  test('Full pipeline: Mock Campaign → Conversion → MPQ Ready', () => {
    // Generate campaign
    const campaign = MockCampaignGenerator.generateCampaign('HORROR', 99999);
    
    // Convert to levels
    const conversion = convertCampaign(campaign, { autoFix: true });
    expect(conversion.success).toBe(true);
    
    // Verify all files are valid DUN format
    for (const [path, buffer] of conversion.files) {
      const view = new DataView(buffer.buffer);
      const width = view.getUint16(0, true);
      const height = view.getUint16(2, true);
      
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(40);
      expect(height).toBeLessThanOrEqual(40);
    }
    
    console.log(`Generated ${conversion.files.size} DUN files from campaign "${campaign.name}"`);
  });

  test('Different seeds produce different campaigns', () => {
    const campaign1 = MockCampaignGenerator.generateCampaign('CLASSIC', 11111);
    const campaign2 = MockCampaignGenerator.generateCampaign('CLASSIC', 22222);
    
    expect(campaign1.name).not.toBe(campaign2.name);
    expect(campaign1.id).not.toBe(campaign2.id);
  });

  test('All campaign templates work', () => {
    const templates = ['CLASSIC', 'HORROR', 'FANTASY', 'DARK_SOULS'];
    
    for (const template of templates) {
      const campaign = MockCampaignGenerator.generateCampaign(template, 12345);
      const conversion = convertCampaign(campaign, { autoFix: true });
      
      expect(conversion.success).toBe(true);
      expect(conversion.files.size).toBeGreaterThan(0);
    }
  });
});
