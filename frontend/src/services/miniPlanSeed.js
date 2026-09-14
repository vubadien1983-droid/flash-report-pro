/**
 * CPP Mechanical Mini Plan - the plan as it stands in the user's spreadsheet
 * (CPP_Mechanical_Mini_Plan.xlsx, "MEC mini plan" sheet).
 *
 * Items 1-19 came from the 2026-09-11 revision; items 20-188 were appended from
 * the 2026-09-13 revision, which starts at item 19 and carries on. The Item
 * number is NOT stored - it is the ordinal of the equipment group, computed by
 * groupMiniPlanItems(), so inserting or deleting an equipment renumbers the
 * rest automatically and the column can never disagree with the order.
 *
 * This is SEED data: it is copied into a NEW Mini Plan report when one is
 * created, and from that moment the report in Firestore is the live document.
 * Editing this file never touches a report that already exists - it only
 * changes what the next new one starts from. That is deliberate: the plan is
 * updated in the app (and through the live share link), not in the source.
 *
 * 2026-09-13: the equipment NAMES were cleaned up at the user's request - the
 * leading verb "Install" removed, and the equipment tag given the project
 * prefix (PK-2601 -> CPPT-PK-2601), with the dash that used to separate the
 * description from the tag dropped. 141 of the 188 names changed; the nine
 * with no tag at all (Safety Equipment, Deluge Sprinkler System, ...) keep
 * their plain names, and a tag already carrying CPPT- was left alone.
 *
 * Each entry is one EQUIPMENT with its activities, in spreadsheet order.
 * Schedules are YYYY-MM-DD; an empty schedule means "not dated yet", which
 * the colour rule reads as "no fill" rather than as overdue.
 */

export const MINI_PLAN_SEED = [
  {
    equipment: 'Turbo Expander Package No.1 CPPT-PK-1301 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-14', activity: 'Cut short anchor bolt & zince coated', status: '' },
      { schedule: '2026-09-14', activity: 'Check final dim & bolting', status: '' },
      { schedule: '2026-09-14', activity: 'Core engine bolt torque & cert issuance', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A (M06-A & M27-A) for Air Cooler', status: '' },
    ],
  },
  {
    equipment: 'Turbo Expander Package No.2 CPPT-PK-2301 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-14', activity: 'Cut short anchor bolt & zince coated', status: '' },
      { schedule: '2026-09-14', activity: 'Check final dim & bolting', status: '' },
      { schedule: '2026-09-14', activity: 'Core engine bolt torque & cert issuance', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A (M06-A & M27-A) for Air Cooler', status: '' },
    ],
  },
  {
    equipment: 'Glycol Contactor Outlet Filter Coalescer No.1 CPPT-F-1202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Pressure Vessels - LP KO Drum CPPT-V-4301 (Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Pressure Vessels - HP KO Drum CPPT-V-4201 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete buttering and welding / NDT', status: '' },
      { schedule: '2026-09-15', activity: 'Bolting and Final Dim check', status: '' },
    ],
  },
  {
    equipment: 'Glycol Contactor Outlet Filter No.2 CPPT-F-2202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Condensate Stabilizer CPPT-V-3404 (Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete installation of ladder, platform (check bolt / nut avaibility)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Jetting Water Pump CPPT-P-3601',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Contactor No.2 CPPT-V-2202',
    rows: [
      { schedule: '', activity: 'Complete installation of ladder, platform, davit arm (check bolt / nut avaibility)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Gas/Gas Exchanger No.1A&B CPPT-E-1302-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Liquid Heater No.1 CPPT-E-1303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Liquid Heater No.2 CPPT-E-2303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Gas/Gas Exchanger No.2A&B CPPT-E-2302-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Diesel Transfer Pump CPPT-P-5401A',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '2026-09-18', activity: 'Complete installation of Seal Plan', status: 'Done' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Reboiler Circulation pumps CPPT-P-3402A',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '2026-09-20', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Reboiler Circulation pumps CPPT-P-3402B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Diesel Firewater pump Package CPPT-PK-8001',
    rows: [
      { schedule: '2026-09-09', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), M03-A (Pumps). Currently only M03-B is avaialbe in CMS', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Fire Water Pump Starting Air Receiver CPPT-V-8001',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting / welding for skid and Final Dim', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M17-A because this is the package with piping, valve and pump', status: '' },
    ],
  },
  {
    equipment: 'Hydraulic Power unit (HPU Panel)',
    rows: [
      { schedule: '2026-09-14', activity: 'Complete Leveling and bolting / welding for skid and Final Dim (Check insulation kid requiremnt because skid frame are SS material)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Diesel Filter Coalescer CPPT-F-5403',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Survival Craft (50 Man CPP) (Cellar deck)',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling & bolting and Final Dim', status: '' },
    ],
  },
  {
    equipment: 'Diesel Inlet Strainer CPPT-F-5402(Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Survival Craft (50 Man CPP) (Cellar deck) - Davit',
    rows: [
      { schedule: '2026-09-25', activity: 'Bolting and Final Dim', status: '' },
    ],
  },
  {
    equipment: 'Nitrogen Receiver CPPT-V-5201',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Outlet Filter No.1 CPPT-F-1402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Booster Pump CPPT-P-3602A',
    rows: [
      { schedule: '2026-09-22', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Inlet Filter Coalescer No.2 CPPT-F-2401',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Contactor No.1 CPPT-V-1202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Diesel Transfer Pump CPPT-P-5401B',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Charocoal Filter CPPT-F-5801A',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Charocoal Filter CPPT-F-5801B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Booster Pump CPPT-P-3602B',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Reflux pumps CPPT-P-3403A',
    rows: [
      { schedule: '2026-09-25', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Reflux pumps CPPT-P-3403B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Booster Pump CPPT-P-3602C',
    rows: [
      { schedule: '2026-09-24', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor Suction Scrubber No.1 CPPT-V-1501',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Production Compressor Suction Scrubber No.2 CPPT-V-2102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Condensate Transfer pumps CPPT-P-3501A',
    rows: [
      { schedule: '2026-09-27', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Condensate Transfer pumps CPPT-P-3501B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor Suction Scrubber No.2 CPPT-V-2501',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Production Compressor Suction Scrubber No.1 CPPT-V-1102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'HP Flare KO transfer pumps CPPT-P-4201A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'HP Flare KO transfer pumps CPPT-P-4201B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Expander Suction Scrubber No.1 CPPT-V-1302',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Expander Suction Scrubber No.2 CPPT-V-2302',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Cold Separation No.1 CPPT-V-1303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'LP Flare KO transfer pumps CPPT-P-4301A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'LP Flare KO transfer pumps CPPT-P-4301B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Gas Scrubbers CPPT-V-1305',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Gas Scrubbers CPPT-V-2305',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Inlet Separators CPPT-V-1001',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Inlet Separators CPPT-V-2001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Portable Water Storage Tank CPPT-T-5801A/B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Cold Separators No.2 CPPT-V-2303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Diesel Centrifuge Package CPPT-PK-5401',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting/welding for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), M03-A (Pumps). Currently M03-B and M04-B are not available in CMS', status: '' },
    ],
  },
  {
    equipment: 'Instrument Air Receiver CPPT-V-5001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Utility Air Receiver CPPT-V-5101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Outlet Filter No.2 CPPT-F-2402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Absorber CPPT-V-1401',
    rows: [
      { schedule: '', activity: 'Check if ITR-A M01-A need to check onshore (Internal parts will be installed offshore)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Absorber CPPT-V-2401',
    rows: [
      { schedule: '', activity: 'Check if ITR-A M01-A need to check onshore (Internal parts will be installed offshore)', status: '' },
    ],
  },
  {
    equipment: 'Mercury Inlet Filter Coalescer No.1 CPPT-F-1401',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Instrument & Utility Air Compressor Package CPPT-PK-5101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Instrument & Utility Air Compressor Package CPPT-PK-5102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Instrument & Utility Air Compressor Package CPPT-PK-5103',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Instrument Air Dryer Package CPPT-PK-5001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: 'Done' },
    ],
  },
  {
    equipment: 'Stabilizer Feed Bottom Exchangers CPPT-E-3405A-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Stabilizer Feed Bottom Exchangers CPPT-E-3405B-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Portable Water Pump A CPPT-P-5801A',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Portable Water Pump B CPPT-P-5801B',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Nitrogen Generator Package CPPT-PK-5201',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Clarify whether M17-A (Vendor Skid Installation) or M23-A (NITROGEN GENERATOR) will be applied', status: '' },
    ],
  },
  {
    equipment: 'Separation Gas Backup Nitrogen Quad CPPT-PK-5202',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Ignition Panel CPPT-IP-4201',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
    ],
  },
  {
    equipment: 'Three Phase Separator CPPT-V-3402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Dilution Blower/Ejector CPPT-K-7780',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Pig Receiver CPPT-R-3201',
    rows: [
      { schedule: '2026-09-09', activity: 'Complete Leveling and bolting, final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Pig Receiver CPPT-R-3202',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Pig Receiver CPPT-R-3203',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Condenste Launcher CPPT-L-3302',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Stabilizer Reboiler CPPT-E-3402A',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Overhead Reflux Separation CPPT-V-3405',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Stabilizer Reboiler CPPT-E-3402B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Air Cooled Condensing Units No.1 CPPT-HEC-9001A',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting, final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M09-A (FAN / COOLER / BLOWER) is requied', status: '' },
      { schedule: '', activity: 'Check if M27-A (Belt Alignment) is required', status: '' },
    ],
  },
  {
    equipment: 'Air Cooled Condensing Units No.2 CPPT-HEC-9001B',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting, final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M09-A (FAN / COOLER / BLOWER) is requied', status: '' },
      { schedule: '', activity: 'Check if M27-A (Belt Alignment) is required', status: '' },
    ],
  },
  {
    equipment: 'Therminol Transfer Pump CPPT-P-5601',
    rows: [
      { schedule: '2026-09-21', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Hypochlorite Package CPPT-PK-5303',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Turbine Wash Water Maker Package CPPT-PK-2601',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Hot Oil Circulation Pumps CPPT-P-5602B',
    rows: [
      { schedule: '2026-09-30', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Analyzer Shelter CPPT-PK-3104',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Metering Package CPPT-PK-3101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Metering Package CPPT-PK-3102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Generation Package No.1 CPPT-PK-1201',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Metering Package CPPT-PK-3103',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Launcher CPPT-L-3301',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Generation Package No.2 CPPT-PK-2201',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) for GLYCOL - CIRCULATION PUMPS (CPPT-P-1201A-01, CPPT-P-1201B-01) is required', status: '' },
    ],
  },
  {
    equipment: 'Glycol Cooler No.1 CPPT-E-1202',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Currently, the equipmnet is applied M09-A (Fan / Cooler / Blower) and M27-A (Belt Alignment) which are applied for Air Cooler, to check and change to M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Produced Water Degasser Package CPPT-PK-3602',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) for Produced water circulation pumps (CPPT-P-3602A/B-01) is required', status: '' },
    ],
  },
  {
    equipment: 'Gas Turbine Generation Package (Dual Fuel) CPPT-PK-6001',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation and Final Dim for Exhaust Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Air Cooler System of Generator', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Turbine Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Enclosure Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) is required', status: '' },
      { schedule: '', activity: 'Check if M19-A (Gas Turbine) is required', status: '' },
      { schedule: '', activity: 'Check if M10-A (Diesel / Gas Engine) is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
    ],
  },
  {
    equipment: 'OFF-SKID LIQUID FUEL FILTER (CPPT-PK-6001)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer))', status: '' },
    ],
  },
  {
    equipment: 'POWERFLEX 755 VFD ROLL-OUT CART (CPPT-PK-6001, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'ENGINE CLEANING CART (CPPT-PK-6002, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'FIRE SUPPRESION CABINET, WATER MIST (CPPT-PK-6001)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL COOLE (CPPT-PK-6001)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL TANK MIST SEPARATOR (CPPT-PK-6001)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'NEUTRAL GROUND RESISTOR (CPPT-PK-6001)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Gas Turbine Generation Package (Dual Fuel) CPPT-PK-6002',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation and Final Dim for Exhaust Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Air Cooler System of Generator', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Turbine Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Enclosure Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) is required', status: '' },
      { schedule: '', activity: 'Check if M19-A (Gas Turbine) is required', status: '' },
      { schedule: '', activity: 'Check if M10-A (Diesel / Gas Engine) is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
    ],
  },
  {
    equipment: 'OFF-SKID LIQUID FUEL FILTER (CPPT-PK-6002)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer))', status: '' },
    ],
  },
  {
    equipment: 'POWERFLEX 755 VFD ROLL-OUT CART (CPPT-PK-6002, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'ENGINE CLEANING CART (CPPT-PK-6002, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'FIRE SUPPRESION CABINET, WATER MIST (CPPT-PK-6002)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL COOLE (CPPT-PK-6002)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL TANK MIST SEPARATOR (CPPT-PK-6002)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'NEUTRAL GROUND RESISTOR (CPPT-PK-6002)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Gas Turbine Generation Package (Dual Fuel) CPPT-PK-6003',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation and Final Dim for Exhaust Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Air Cooler System of Generator', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Turbine Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Enclosure Inlet Duct System', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) is required', status: '' },
      { schedule: '', activity: 'Check if M19-A (Gas Turbine) is required', status: '' },
      { schedule: '', activity: 'Check if M10-A (Diesel / Gas Engine) is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
    ],
  },
  {
    equipment: 'OFF-SKID LIQUID FUEL FILTER (CPPT-PK-6003)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer))', status: '' },
    ],
  },
  {
    equipment: 'POWERFLEX 755 VFD ROLL-OUT CART (CPPT-PK-6003, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'ENGINE CLEANING CART (CPPT-PK-6003, Removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'FIRE SUPPRESION CABINET, WATER MIST (CPPT-PK-6003)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL COOLE (CPPT-PK-6003)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'LUBE OIL TANK MIST SEPARATOR (CPPT-PK-6003)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'NEUTRAL GROUND RESISTOR (CPPT-PK-6003)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Cooler No.2 CPPT-E-2202',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Currently, the equipmnet is applied M09-A (Fan / Cooler / Blower) and M27-A (Belt Alignment) which are applied for Air Cooler, to check and change to M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Fuel Gas Package CPPT-PK-3801',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting, final dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Vapor Recovery Compressor No.1 Package CPPT-PK-3001',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Vapour Recovery Intercooler/After Cooler No.1 CPPT-E-3001-01/02',
    rows: [
      { schedule: '2026-09-19', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Pump CPPT-P-3603A',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Pump CPPT-P-3603B',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
    ],
  },
  {
    equipment: 'Water Injection Pump CPPT-P-3603C',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
    ],
  },
  {
    equipment: 'Assembly Production & Pipeline Comp Package No.1 CPPT-PK-1101',
    rows: [
      { schedule: '2026-09-16', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Exhaust Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for VENTILATION DUCTS AND FANS System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for INLET DUCT INSTALLATION System', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) is required', status: '' },
      { schedule: '', activity: 'Check if M19-A (Gas Turbine) is required', status: '' },
      { schedule: '', activity: 'Check if M10-A (Diesel / Gas Engine) is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
    ],
  },
  {
    equipment: 'WATER MIST FIRE FIGHTING SYSTEM (CPPT-SK-1101-04)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'RUNDOWN TANK (CPPT-T-1101-03)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL OIL VAPOR SEPARATOR (CPPT-SK-1101-02)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'INERAL LUBE OIL/AIR COOLER (CPPT-E-1101-01)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL LUBE OIL PURIFIER TROLLEY (CPPT-TR-1101-02 Removable Item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'HYDRAULIC STARTING SYSTEM (CPPT-P-1101-10)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'SYNTHETIC OIL MIST ELIMINATOR (CPPT-SK-1101-03)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL LUBE OIL CONSOLE ON MAIN SKID',
    rows: [
      { schedule: '', activity: 'Check if M01-A (Pressure Vessel / Tank / Column) for T-1101-04  MINERAL OIL TANK is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of P-1101A/B-04 is required', status: '' },
    ],
  },
  {
    equipment: 'FUEL GAS CHROMATOGRAPH SYSTEM (CPPT-SK-1101-01)',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting, final dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'DGS TREATMENT SKID (CPPT-SK-1101-05)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Assembly Production & Pipeline Comp Package No.1 CPPT-PK-2101',
    rows: [
      { schedule: '2026-09-16', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for Exhaust Duct System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for VENTILATION DUCTS AND FANS System', status: '' },
      { schedule: '', activity: 'Complete installation and Final Dim for INLET DUCT INSTALLATION System', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) is required', status: '' },
      { schedule: '', activity: 'Check if M19-A (Gas Turbine) is required', status: '' },
      { schedule: '', activity: 'Check if M10-A (Diesel / Gas Engine) is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
    ],
  },
  {
    equipment: 'WATER MIST FIRE FIGHTING SYSTEM (CPPT-SK-2101-04)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'RUNDOWN TANK (CPPT-T-2101-03)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL OIL VAPOR SEPARATOR (CPPT-SK-2101-02)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'INERAL LUBE OIL/AIR COOLER (CPPT-E-2101-01)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL LUBE OIL PURIFIER TROLLEY (CPPT-TR-2101-02 Removable Item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'HYDRAULIC STARTING SYSTEM (CPPT-P-2101-10)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'SYNTHETIC OIL MIST ELIMINATOR (CPPT-SK-2101-03)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'MINERAL LUBE OIL CONSOLE ON MAIN SKID',
    rows: [
      { schedule: '', activity: 'Check if M01-A (Pressure Vessel / Tank / Column) for T-2101-04  MINERAL OIL TANK is required', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of P-2101A/B-04 is required', status: '' },
    ],
  },
  {
    equipment: 'FUEL GAS CHROMATOGRAPH SYSTEM (CPPT-SK-2101-01)',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting, final dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'DGS TREATMENT SKID (CPPT-SK-2101-05)',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Glycol Storage Tank CPPT-T-5304',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Chemical Injection Package CPPT-PK-5301',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Hot Oil Slip Stream Filter CPPT-F-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Sale Gas Corrosion inhibitor Package CPPT-PK-5302',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Therminol Storage Tank CPPT-T-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Hot Oil Circulation Pumps CPPT-P-5602A',
    rows: [
      { schedule: '2026-10-01', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Glycol Transfer Pump CPPT-P-5304',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'Production Comprressor after Cooler No.1 CPPT-E-1102',
    rows: [
      { schedule: '2026-10-06', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Overhead Condenser CPPT-E-3403',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Bottom Cooler CPPT-E-3404',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Unit No.1 CPPT-E-5601A',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Currently, The equipmnet is applied M01-A (Pressure Vessel / Tank / Column) and available in CMS but there is no pressure vessel / tank is in the skid', status: '' },
    ],
  },
  {
    equipment: 'Hot Oil Expansion Tank CPPT-V-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor after Cooler No.1 CPPT-E-1501',
    rows: [
      { schedule: '2026-10-07', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Trim Cooler CPPT-E-5602',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Unit No.2 CPPT-E-5601B',
    rows: [
      { schedule: '2026-09-26', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Currently, The equipmnet is applied M01-A (Pressure Vessel / Tank / Column) and available in CMS but there is no pressure vessel / tank is in the skid', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor after Cooler No.2 CPPT-E-2501',
    rows: [
      { schedule: '2026-10-08', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Mineral Oil Forced Air Cooler CPPT-E-2101',
    rows: [
      { schedule: '2026-10-10', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Turbo Expander Lube Oil Cooler No.1 CPPT-E-1301',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Turbo Expander Lube Oil Cooler No.2 CPPT-E-2301',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Production Compressor after Cooler No.2 CPPT-E-2102',
    rows: [
      { schedule: '2026-06-10', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'East Pedestal Crane CPPT-CR-9102',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M14-A (Pedestal Crane)', status: '' },
    ],
  },
  {
    equipment: 'West Pedestal Crane CPPT-CR-9101',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M14-A (Pedestal Crane)', status: '' },
    ],
  },
  {
    equipment: 'Close Drain Drum CPPT-V-4701',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Sewage Treatment Unit and Ejector CPPT-PK-5501',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Seawage Collection Tank CPPT-T-5501',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Dechlor tank CPPT-T-5501-05 (DT-1 removable item)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'Recovered Oil Pump CPPT-P-4702A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Recovered Oil Pump CPPT-P-4702B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Closed Drain Pump CPPT-P-4701A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Closed Drain Pump CPPT-P-4701B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'PW Package - Desender & Deoiler Package CPPT-PK-3601',
    rows: [
      { schedule: '', activity: 'Complete modification clashed spool of PIT-3601-06 and PG-3601-06', status: '' },
      { schedule: '', activity: 'Complete Leveling and bolting, final dimention for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Wash Down Water (Fresh Water) Storage Tank CPPT-T-5802',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting, final dimention for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Wash Down Water Booster Pump CPPT-P-5802',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Seal Plan', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Lab Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Deluge Sprinkler System',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Safety Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Material Handling Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Turbine Wash water Collection Tank CPPT-T-XX01',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Turbine Wash Water Pump CPPT-P-XX01',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
];

/** Default header for a brand-new Mini Plan report. */
export const MINI_PLAN_DEFAULT_TITLE = 'CPP Mechanical Mini Plan';
