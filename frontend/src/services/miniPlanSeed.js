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
 * Each entry is one EQUIPMENT with its activities, in spreadsheet order.
 * Schedules are YYYY-MM-DD; an empty schedule means "not dated yet", which
 * the colour rule reads as "no fill" rather than as overdue.
 */

export const MINI_PLAN_SEED = [
  {
    equipment: 'Install Turbo Expander Package No.1 PK-1301 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-14', activity: 'Cut short anchor bolt & zince coated', status: '' },
      { schedule: '2026-09-14', activity: 'Check final dim & bolting', status: '' },
      { schedule: '2026-09-14', activity: 'Core engine bolt torque & cert issuance', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A (M06-A & M27-A) for Air Cooler', status: '' },
    ],
  },
  {
    equipment: 'Install Turbo Expander Package No.2 PK-2301 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-14', activity: 'Cut short anchor bolt & zince coated', status: '' },
      { schedule: '2026-09-14', activity: 'Check final dim & bolting', status: '' },
      { schedule: '2026-09-14', activity: 'Core engine bolt torque & cert issuance', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A (M06-A & M27-A) for Air Cooler', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Contactor Outlet Filter Coalescer No.1 F-1202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Install Pressure Vessels - LP KO Drum V-4301 (Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Pressure Vessels - HP KO Drum V-4201 (Cellar Deck)',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete buttering and welding / NDT', status: '' },
      { schedule: '2026-09-15', activity: 'Bolting and Final Dim check', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Contactor Outlet Filter No.2 - F-2202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Install Condensate Stabilizer - V-3404 (Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete installation of ladder, platform (check bolt / nut avaibility)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Jetting Water Pump P-3601',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Contactor No.2 V-2202',
    rows: [
      { schedule: '', activity: 'Complete installation of ladder, platform, davit arm (check bolt / nut avaibility)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Gas/Gas Exchanger No.1A&B E-1302-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Liquid Heater No.1 E-1303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Liquid Heater No.2 E-2303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Gas/Gas Exchanger No.2A&B - E-2302-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Transfer Pump P-5401A',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '2026-09-18', activity: 'Complete installation of Plan Seal', status: 'Done' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '2026-09-18', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Reboiler Circulation pumps - P-3402A',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '2026-09-20', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '2026-09-20', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Reboiler Circulation pumps - P-3402B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Firewater pump Package PK-8001',
    rows: [
      { schedule: '2026-09-09', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), M03-A (Pumps). Currently only M03-B is avaialbe in CMS', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Fire Water Pump Starting Air Receiver V-8001',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting / welding for skid and Final Dim', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M17-A because this is the package with piping, valve and pump', status: '' },
    ],
  },
  {
    equipment: 'Install Hydraulic Power unit (HPU Panel)',
    rows: [
      { schedule: '2026-09-14', activity: 'Complete Leveling and bolting / welding for skid and Final Dim (Check insulation kid requiremnt because skid frame are SS material)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Filter Coalescer F-5403',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Survival Craft (50 Man CPP) (Cellar deck)',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling & bolting and Final Dim', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Inlet Strainer - F-5402(Cellar Deck)',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Survival Craft (50 Man CPP) (Cellar deck) - Davit',
    rows: [
      { schedule: '2026-09-25', activity: 'Bolting and Final Dim', status: '' },
    ],
  },
  {
    equipment: 'Install Nitrogen Receiver V-5201',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Outlet Filter No.1 F-1402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Booster Pump P-3602A',
    rows: [
      { schedule: '2026-09-22', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Inlet Filter Coalescer No.2 F-2401',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Contactor No.1 V-1202',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Transfer Pump P-5401B',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Charocoal Filter F-5801A',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Charocoal Filter F-5801B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Booster Pump P-3602B',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Reflux pumps - P-3403A',
    rows: [
      { schedule: '2026-09-25', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Reflux pumps - P-3403B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Booster Pump P-3602C',
    rows: [
      { schedule: '2026-09-24', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Pipeline Compressor Suction Scrubber No.1 V-1501',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Production Compressor Suction Scrubber No.2 V-2102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Condensate Transfer pumps - P-3501A',
    rows: [
      { schedule: '2026-09-27', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Condensate Transfer pumps - P-3501B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Pipeline Compressor Suction Scrubber No.2 V-2501',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Production Compressor Suction Scrubber No.1 V-1102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install HP Flare KO transfer pumps - P-4201A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install HP Flare KO transfer pumps - P-4201B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Expander Suction Scrubber No.1 V-1302',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Expander Suction Scrubber No.2 - V-2302',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Cold Separation No.1 V-1303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install LP Flare KO transfer pumps - P-4301A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install LP Flare KO transfer pumps - P-4301B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Gas Scrubbers - V-1305',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Gas Scrubbers - V-2305',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Inlet Separators - V-1001',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Inlet Separators - V-2001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Portable Water Storage Tank T-5801A/B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Cold Separators No.2 - V-2303',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Diesel Centrifuge Package PK-5401',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting/welding for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), M03-A (Pumps). Currently M03-B and M04-B are not available in CMS', status: '' },
    ],
  },
  {
    equipment: 'Install Instrument Air Receiver V-5001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Utility Air Receiver V-5101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Outlet Filter No.2 F-2402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Absorber V-1401',
    rows: [
      { schedule: '', activity: 'Check if ITR-A M01-A need to check onshore (Internal parts will be installed offshore)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Absorber V-2401',
    rows: [
      { schedule: '', activity: 'Check if ITR-A M01-A need to check onshore (Internal parts will be installed offshore)', status: '' },
    ],
  },
  {
    equipment: 'Install Mercury Inlet Filter Coalescer No.1 F-1401',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M08-A (Filter / Strainer)', status: '' },
    ],
  },
  {
    equipment: 'Install Instrument & Utility Air Compressor Package-PK - 5101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Install Instrument & Utility Air Compressor Package-PK - 5102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Install Instrument & Utility Air Compressor Package-PK - 5103',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Check requirement of additional ITR-A for M04-A (Coupling Alignment), currently M05-B is already avaible in CMS', status: '' },
    ],
  },
  {
    equipment: 'Install Instrument Air Dryer Package PK-5001',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: 'Done' },
    ],
  },
  {
    equipment: 'Install Stabilizer Feed Bottom Exchangers  - E-3405A-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Stabilizer Feed Bottom Exchangers  - E-3405B-01/02',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Portable Water Pump A P-5801A',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Portable Water Pump B P-5801B',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Nitrogen Generator Package PK-5201',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Clarify whether M17-A (Vendor Skid Installation) or M23-A (NITROGEN GENERATOR) will be applied', status: '' },
    ],
  },
  {
    equipment: 'Install Separation Gas Backup Nitrogen Quad PK-5202',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Ignition Panel IP-4201',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
    ],
  },
  {
    equipment: 'Install Three Phase Separator V-3402',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Dilution Blower/Ejector K-7780',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Pig Receiver R-3201',
    rows: [
      { schedule: '2026-09-09', activity: 'Complete Leveling and bolting, final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Pig Receiver R-3202',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Pig Receiver R-3203',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Condenste Launcher L-3302',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Stabilizer Reboiler E-3402A',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Overhead Reflux Separation -V-3405',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Stabilizer Reboiler E-3402B',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Air Cooled Condensing Units No.1 CPPT-HEC-9001A',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting, final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M09-A (FAN / COOLER / BLOWER) is requied', status: '' },
      { schedule: '', activity: 'Check if M27-A (Belt Alignment) is required', status: '' },
    ],
  },
  {
    equipment: 'Install Air Cooled Condensing Units No.2 CPPT-HEC-9001B',
    rows: [
      { schedule: '2026-09-12', activity: 'Complete Leveling and bolting, final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M09-A (FAN / COOLER / BLOWER) is requied', status: '' },
      { schedule: '', activity: 'Check if M27-A (Belt Alignment) is required', status: '' },
    ],
  },
  {
    equipment: 'Install Therminol Transfer Pump P-5601',
    rows: [
      { schedule: '2026-09-21', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Hypochlorite Package PK-5303',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Turbine Wash Water Maker Package PK-2601',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Hot Oil Circulation Pumps P-5602B',
    rows: [
      { schedule: '2026-09-30', activity: 'Complete Leveling and bolting for skid', status: 'Done' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Analyzer Shelter - PK-3104',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Metering Package - PK-3101',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Metering Package - PK-3102',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Generation Package No.1 PK-1201',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Metering Package - PK-3103',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Launcher L-3301',
    rows: [
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Generation Package No.2 PK-2201',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) for GLYCOL - CIRCULATION PUMPS (CPPT-P-1201A-01, CPPT-P-1201B-01) is required', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Cooler No.1 E-1202',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Currently, the equipmnet is applied M09-A (Fan / Cooler / Blower) and M27-A (Belt Alignment) which are applied for Air Cooler, to check and change to M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Produced Water Degasser Package PK-3602',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) for Produced water circulation pumps (CPPT-P-3602A/B-01) is required', status: '' },
    ],
  },
  {
    equipment: 'Install Gas Turbine Generation Package (Dual Fuel) PK-6001',
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
    equipment: 'Install Gas Turbine Generation Package (Dual Fuel) PK-6002',
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
    equipment: 'Install Gas Turbine Generation Package (Dual Fuel) PK-6003',
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
    equipment: 'Install Glycol Cooler No.2 E-2202',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
      { schedule: '', activity: 'Currently, the equipmnet is applied M09-A (Fan / Cooler / Blower) and M27-A (Belt Alignment) which are applied for Air Cooler, to check and change to M06-A (Heat Exchanger / Heater)', status: '' },
    ],
  },
  {
    equipment: 'Install Fuel Gas Package PK-3801',
    rows: [
      { schedule: '', activity: 'Equipment arrival and Receiving inspection', status: '' },
      { schedule: '', activity: 'Equipment Installation', status: '' },
      { schedule: '', activity: 'Leveling and bolting, final dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Vapor Recovery Compressor No.1 Package PK-3001',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Check if M04-A (Coupling Alignment) of  is required', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Vapour Recovery Intercooler/After Cooler No.1 E-3001-01/02',
    rows: [
      { schedule: '2026-09-19', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Pump P-3603A',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Pump P-3603B',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
    ],
  },
  {
    equipment: 'Install Water Injection Pump P-3603C',
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
    equipment: 'Glycol Storage Tank T-5304',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Chemical Injection Package PK-5301',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Hot Oil Slip Stream Filter F-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M08-A (FILTER / STRAINER)', status: '' },
    ],
  },
  {
    equipment: 'Install Sale Gas Corrosion inhibitor Package PK-5302',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Therminol Storage Tank T-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/welding and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Hot Oil Circulation Pumps P-5602A',
    rows: [
      { schedule: '2026-10-01', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Glycol Transfer Pump P-5304',
    rows: [
      { schedule: '2026-09-15', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M28-A (Miscellaneous Equipment)', status: '' },
    ],
  },
  {
    equipment: 'Production Comprressor after Cooler No.1 -E-1102',
    rows: [
      { schedule: '2026-10-06', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Overhead Condenser E-3403',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Bottom Cooler E-3404',
    rows: [
      { schedule: '2026-09-18', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Unit No.1 E-5601A',
    rows: [
      { schedule: '2026-09-20', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Currently, The equipmnet is applied M01-A (Pressure Vessel / Tank / Column) and available in CMS but there is no pressure vessel / tank is in the skid', status: '' },
    ],
  },
  {
    equipment: 'Hot Oil Expansion Tank V-5601',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor after Cooler No.1 E-1501',
    rows: [
      { schedule: '2026-10-07', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Trim Cooler E-5602',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Waste Heat Recovery Unit No.2 E-5601B',
    rows: [
      { schedule: '2026-09-26', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Currently, The equipmnet is applied M01-A (Pressure Vessel / Tank / Column) and available in CMS but there is no pressure vessel / tank is in the skid', status: '' },
    ],
  },
  {
    equipment: 'Pipeline Compressor after Cooler No.2 E-2501',
    rows: [
      { schedule: '2026-10-08', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Mineral Oil Forced Air Cooler E-2101',
    rows: [
      { schedule: '2026-10-10', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Turbo Expander Lube Oil Cooler No.1 E-1301',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Turbo Expander Lube Oil Cooler No.2 E-2301',
    rows: [
      { schedule: '2026-09-23', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M09-A (FAN / COOLER / BLOWER)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M27-A (Belt Alignment)', status: '' },
    ],
  },
  {
    equipment: 'Production Compressor after Cooler No.2 E-2102',
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
    equipment: 'Install Close Drain Drum-V-4701',
    rows: [
      { schedule: '', activity: 'Complete Leveling/Bolting and Final Dim for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Sewage Treatment Unit and Ejector-PK-5501',
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
    equipment: 'Install Recovered Oil Pump-P-4702A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Recovered Oil Pump-P-4702B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Closed Drain Pump-P-4701A',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Closed Drain Pump-P-4701B',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install PW Package - Desender & Deoiler Package - PK-3601',
    rows: [
      { schedule: '', activity: 'Complete modification clashed spool of PIT-3601-06 and PG-3601-06', status: '' },
      { schedule: '', activity: 'Complete Leveling and bolting, final dimention for skid', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Wash Down Water (Fresh Water) Storage Tank-T-5802',
    rows: [
      { schedule: '', activity: 'Complete Leveling and bolting, final dimention for skid', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M01-A (Pressure Vessel / Tank / Column)', status: '' },
    ],
  },
  {
    equipment: 'Install Wash Down Water Booster Pump-P-5802',
    rows: [
      { schedule: '2026-09-11', activity: 'Complete Leveling and bolting for skid', status: '' },
      { schedule: '', activity: 'Complete installation of Plan Seal', status: 'Done' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M03-A (Pumps)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M04-A (Coupling Alignment)', status: '' },
      { schedule: '', activity: 'Complete and NFI for M17-A (Vendor Skid Installation)', status: '' },
    ],
  },
  {
    equipment: 'Install Lab Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Deluge Sprinkler System',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Safety Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Material Handling Equipment',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Turbine Wash water Collection Tank T-XX01',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
  {
    equipment: 'Install Turbine Wash Water Pump P-XX01',
    rows: [
      { schedule: '', activity: '', status: '' },
    ],
  },
];

/** Default header for a brand-new Mini Plan report. */
export const MINI_PLAN_DEFAULT_TITLE = 'CPP Mechanical Mini Plan';
