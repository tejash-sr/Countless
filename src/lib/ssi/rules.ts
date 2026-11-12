/**
 * SSI figures and the official rules behind every decision Countless makes.
 * Individual (not couple) rates only. Every figure was checked against the
 * linked SSA / IRS source on CHECKED_ON; update this file, never the engine,
 * when SSA publishes new amounts.
 */

export const CHECKED_ON = "2026-11-09";

export type RuleId =
  | "FBR"
  | "GIFTS_ARE_INCOME"
  | "THIRD_PARTY_BILLS"
  | "ISM_OUTSIDE_HOUSEHOLD"
  | "PMV"
  | "FOOD_NOT_ISM"
  | "RMA"
  | "IIE"
  | "GIE"
  | "RESOURCES_FOM"
  | "RESOURCE_LIMIT"
  | "ABLE"
  | "ABLE_ANNUAL_LIMIT";

export interface Rule {
  code: string;
  title: string;
  url: string;
}

const poms = (id: string) => `https://secure.ssa.gov/POMS.nsf/lnx/${id}`;

export const RULES: Record<RuleId, Rule> = {
  FBR: {
    code: "SSA OACT",
    title: "SSI Federal Payment Amounts",
    url: "https://www.ssa.gov/OACT/cola/SSI.html",
  },
  GIFTS_ARE_INCOME: { code: "SI 00830.520", title: "Gifts", url: poms("0500830520") },
  THIRD_PARTY_BILLS: {
    code: "SI 00815.400",
    title: "Bills Paid By a Third Party",
    url: poms("0500815400"),
  },
  ISM_OUTSIDE_HOUSEHOLD: {
    code: "SI 00835.350",
    title: "In-Kind Support and Maintenance from Outside a Household (including vendor payments)",
    url: poms("0500835350"),
  },
  PMV: { code: "SI 00835.300", title: "Presumed Maximum Value (PMV) Rule", url: poms("0500835300") },
  FOOD_NOT_ISM: {
    code: "Federal Register 2024-06464",
    title: "Omitting Food From In-Kind Support and Maintenance Calculations (effective 9/30/2024)",
    url: "https://www.federalregister.gov/documents/2024/03/27/2024-06464/omitting-food-from-in-kind-support-and-maintenance-calculations",
  },
  RMA: {
    code: "SI 02005.001",
    title: "Retrospective Monthly Accounting Computation",
    url: poms("0502005001"),
  },
  IIE: {
    code: "SI 00810.410",
    title: "Infrequent or Irregular Income Exclusion",
    url: poms("0500810410"),
  },
  GIE: {
    code: "SI 00810.420",
    title: "$20 Per Month General Income Exclusion",
    url: poms("0500810420"),
  },
  RESOURCES_FOM: {
    code: "SI 01110.600",
    title: "First-of-the-Month Rule for Making Resource Determinations",
    url: poms("0501110600"),
  },
  RESOURCE_LIMIT: {
    code: "20 CFR 416.1205",
    title: "Limitation on resources ($2,000 for an individual)",
    url: "https://www.ecfr.gov/current/title-20/chapter-III/part-416/subpart-L/section-416.1205",
  },
  ABLE: {
    code: "SI 01130.740",
    title: "Achieving a Better Life Experience (ABLE) Accounts",
    url: poms("0501130740"),
  },
  ABLE_ANNUAL_LIMIT: {
    code: "26 U.S.C. 529A(b)(2)",
    title: "ABLE yearly contribution limit equals the gift-tax annual exclusion",
    url: "https://www.law.cornell.edu/uscode/text/26/529A",
  },
};

export interface SsiYearParams {
  year: number;
  /** Maximum federal SSI payment for an eligible individual, per month. */
  fbrIndividual: number;
  /** Value of the one-third reduction: 1/3 of the FBR (SI 02005.001 C.4). */
  vtr: number;
  /** Presumed maximum value: VTR + $20 (SI 00835.300). */
  pmv: number;
  /** Total third-party ABLE contributions allowed in the calendar year. */
  ableAnnualLimit: number;
  ableAnnualLimitSource: string;
}

const PARAMS: Record<number, SsiYearParams> = {
  2026: {
    year: 2026,
    fbrIndividual: 994,
    vtr: 331.33,
    pmv: 351.33,
    ableAnnualLimit: 19_000,
    ableAnnualLimitSource: "IRS gift-tax annual exclusion for 2026",
  },
  2027: {
    year: 2027,
    fbrIndividual: 1029, // 3.6% COLA effective January 2027
    vtr: 343,
    pmv: 363,
    ableAnnualLimit: 20_000,
    ableAnnualLimitSource: "IRS gift-tax annual exclusion for 2027 (Nov 2026 inflation adjustments)",
  },
};

export const SSI_CONSTANTS = {
  generalIncomeExclusion: 20,
  infrequentUnearnedPerQuarter: 60,
  resourceLimitIndividual: 2_000,
  ableResourceExclusion: 100_000,
} as const;

export function paramsFor(year: number): SsiYearParams {
  const p = PARAMS[year];
  if (!p) {
    throw new Error(
      `Countless has no published SSI figures for ${year}. Add them from ${RULES.FBR.url} before simulating that year.`,
    );
  }
  return p;
}
