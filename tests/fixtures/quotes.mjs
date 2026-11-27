/* AION Hybrid Web - five realistic supplier quotes for the quote reader. Apache-2.0.
 * Created by Anshul Reddy (idea and project owner) for #BuildHybridAI 2026.
 *
 * Every supplier, reference number and person here is fictional. The quotes
 * mix the date formats, currencies and delivery terms real quotes use:
 * month-first US dates, DD/MM/YYYY, DD-Mon-YYYY, ordinals with a weekday,
 * lakh amounts, unit rates beside totals, "+ 5% GST", VAT, sales tax, FOB and
 * ex-godown terms, and a lead time with no delivery date at all.
 *
 * `expect` is what plain code must read from the text. Dates are UTC days
 * (YYYY-MM-DD), times are minutes after midnight.
 */
export const QUOTES = [
  {
    name: "US AV rental: month-first date, 12-hour time, USD, sales tax extra",
    text: [
      "Northfield AV Rentals",
      "Quote #NF-2291 for a 5 m x 3 m LED wall and PA for 300 guests.",
      "Subtotal: $18,450.00 USD, excluding sales tax. 30% deposit due on signing.",
      "Delivery to the venue dock on December 9, 2026 by 2:00 PM.",
      "Setup and installation are included and handled by our crew.",
      "Warranty: equipment is covered by our standard rental warranty during the event.",
      "Cancellation within 10 days of the event: 50% of the rental fee.",
    ].join("\n"),
    privateConstraints: { maxBudget: "$21,000 including tax", readyBy: "2026-12-10 09:00", gstRate: "8.875", installationRequired: true },
    expect: {
      supplier: "Northfield AV Rentals",
      price: { amount: 18450, currency: "USD", taxIncluded: false },
      delivery: { day: "2026-12-09", time: 14 * 60 },
      install: "included",
      checks: { budget: "pass", deadline: "pass", install: "pass" },
      verdict: "fits",
    },
  },
  {
    name: "UK staging: DD/MM/YYYY, GBP + VAT at 20%, time window, installation excluded",
    text: [
      "Harrow & Pike Staging Ltd",
      "Quotation ref HP/24/118, issued 20/11/2026.",
      "Total: £9,800 + VAT at 20%. Payment: 50% on order, balance 14 days after the event.",
      "Delivery: 14/12/2026, AM slot (08:00-12:00).",
      "Installation is not included and can be quoted separately.",
      "Warranty: equipment replaced free of charge if it fails during hire.",
      "Cancellation: full refund up to 21 days before delivery.",
    ].join("\n"),
    privateConstraints: { maxBudget: "£12,000 including VAT", readyBy: "14 December 2026 10:00", gstRate: "20", installationRequired: true },
    expect: {
      supplier: "Harrow & Pike Staging Ltd",
      price: { amount: 9800, currency: "GBP", taxIncluded: false, taxRate: 20 },
      delivery: { day: "2026-12-14", time: 12 * 60 },
      install: "excluded",
      headings: { Cancellation: /full refund/ },
      checks: { budget: "pass", deadline: "fail", install: "fail" },
      verdict: "not_suitable",
    },
  },
  {
    name: "Indian wholesaler: DD-Mon-YYYY, unit rate before the total, + 5% GST, ex-godown",
    text: [
      "Shree Balaji Traders",
      "Quotation No. SBT/1127 dated 22-Nov-2026",
      "Sunflower oil 15 L tin: ₹1,850 per carton, 40 cartons. Total ₹74,000 + 5% GST.",
      "Payment: 25% advance, balance on delivery.",
      "Delivery: 03-Dec-2026, ex-godown Bhiwandi. Freight extra.",
      "Goods once sold will not be taken back.",
    ].join("\n"),
    privateConstraints: { maxBudget: "Rs 80,000 including GST", readyBy: "2026-12-05", gstRate: "18", installationRequired: false, maxAdvancePct: "30%" },
    expect: {
      supplier: "Shree Balaji Traders",
      price: { amount: 74000, currency: "INR", taxIncluded: false, taxRate: 5 },
      delivery: { day: "2026-12-03", time: null },
      terms: ["ex-godown", "freight extra"],
      checks: { budget: "pass", deadline: "pass", install: "pass", advance: "pass" },
      verdict: "fits",
    },
  },
  {
    name: "Indian events: ordinal date with weekday and comma, 'Rs. 2.4 lakh', '7 am'",
    text: [
      "Mehta Sound & Light",
      "Quote for stage lighting and sound, Annual Day, 400 guests.",
      "Package price: Rs. 2.4 lakh, inclusive of GST.",
      "Delivery and setup on Thursday, 10th December, 2026 at 7 am.",
      "Installation by our technicians is included.",
      "Support: one engineer on site through the event.",
      "Cancellation: 25% charged if cancelled within 7 days.",
    ].join("\n"),
    privateConstraints: { maxBudget: "Rs 2,50,000 including GST", readyBy: "2026-12-10 09:00", gstRate: "18", installationRequired: true },
    expect: {
      supplier: "Mehta Sound & Light",
      price: { amount: 240000, currency: "INR", taxIncluded: true },
      delivery: { day: "2026-12-10", time: 7 * 60 },
      install: "included",
      checks: { budget: "pass", deadline: "risk", install: "pass" },
      verdict: "needs_answers",
    },
  },
  {
    name: "Overseas factory: 'Nov. 26, 2026' quote date, USD FOB, lead time only (no delivery date)",
    text: [
      "Shenzhen Brightway Display Co., Ltd.",
      "PI No. BW-2611-07, Date: Nov. 26, 2026",
      "Unit price USD 1,330 per cabinet, 6 cabinets. Total amount USD 7,980 FOB Shenzhen.",
      "Payment terms: 30% T/T deposit, 70% before shipment.",
      "Lead time: 25-30 working days after deposit received.",
      "Warranty: 2 years for parts.",
    ].join("\n"),
    privateConstraints: { maxBudget: "USD 8,500", readyBy: "2026-12-20", gstRate: "0", installationRequired: false },
    expect: {
      supplier: "Shenzhen Brightway Display Co., Ltd.",
      price: { amount: 7980, currency: "USD", taxIncluded: null },
      delivery: null,
      leadTime: true,
      terms: ["FOB"],
      checks: { budget: "unknown", deadline: "unknown", install: "pass" },
      verdict: "needs_answers",
    },
  },
];

/* Single date strings: the formats suppliers write, and the ones plain code
 * must refuse to guess. day null = must not read a date. */
export const DATES = [
  { text: "2026-12-11 09:00", day: "2026-12-11", time: 540 },
  { text: "11 December 2026", day: "2026-12-11", time: null },
  { text: "11th December 2026", day: "2026-12-11", time: null },
  { text: "11 Dec 2026", day: "2026-12-11", time: null },
  { text: "11-Dec-2026", day: "2026-12-11", time: null },
  { text: "Friday, 11th of December, 2026", day: "2026-12-11", time: null },
  { text: "December 11, 2026", day: "2026-12-11", time: null },
  { text: "Dec. 11th, 2026 at 4:30 pm", day: "2026-12-11", time: 16 * 60 + 30 },
  { text: "Sept 3, 2026", day: "2026-09-03", time: null },
  { text: "25/12/2026", day: "2026-12-25", time: null },
  { text: "12/25/2026", day: "2026-12-25", time: null },
  { text: "25.12.2026 14:00", day: "2026-12-25", time: 840 },
  { text: "05/06/2026", ambiguous: true },
  { text: "05/06/2026 (DD/MM/YYYY)", day: "2026-06-05", time: null },
  { text: "31 February 2026", invalid: true },
  { text: "by noon on 11 December 2026", day: "2026-12-11", time: 720 },
  { text: "Lead time 25-30 working days", day: null },
  { text: "valid for 7 days", day: null },
];
