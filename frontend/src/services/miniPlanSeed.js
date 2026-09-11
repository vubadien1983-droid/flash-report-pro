/**
 * CPP Mechanical Mini Plan - the plan as it stands in the user's spreadsheet,
 * items 1 to 19 (CPP_Mechanical_Mini_Plan.xlsx, "MEC mini plan" sheet).
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
];

/** Default header for a brand-new Mini Plan report. */
export const MINI_PLAN_DEFAULT_TITLE = 'CPP Mechanical Mini Plan';
