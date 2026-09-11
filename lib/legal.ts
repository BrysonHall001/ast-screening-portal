// ============================================================================
// LEGAL TEXT — SINGLE SOURCE OF TRUTH
//
// Everything the candidate reads and signs lives in this one file so your
// attorney's approved language can be dropped in without touching any other
// code. The text below is a structurally-correct placeholder modeled on
// standard FCRA disclosure/authorization forms. REPLACE IT with the exact
// wording counsel approved before screening a real candidate, then bump
// DISCLOSURE_VERSION (the version is stored with every signature so you can
// always prove which text a candidate saw).
// ============================================================================

export const DISCLOSURE_VERSION = 'v0.1-placeholder'

export const COMPANY_NAME = 'All-Star Talent, Inc.'

// The FCRA requires this to be a clear and conspicuous, STANDALONE document —
// which is why the consent flow shows it on its own screen with nothing else.
export const DISCLOSURE_TEXT = `DISCLOSURE REGARDING BACKGROUND INVESTIGATION

${COMPANY_NAME} ("the Company"), acting as a consumer reporting agency on behalf of the employer considering you for employment ("the Employer"), may obtain a consumer report about you for employment purposes.

The report will be limited to a review of publicly available social media and internet content associated with accounts you identify, and may include an assessment of that content against job-related behavioral criteria selected by the Employer. The review covers only content that is publicly visible; no private accounts, private messages, or password-protected content will be accessed, and you will never be asked to provide passwords or account access.

The report will not include, and the Company will not provide to the Employer, information about your race, color, religion, national origin, age, sex, sexual orientation, gender identity, disability, medical condition, pregnancy, genetic information, or lawful union activity.

The nature and scope of the report is described above. You are entitled, upon written request made within a reasonable time, to a complete and accurate disclosure of the nature and scope of the investigation requested, and to a written summary of your rights under the Fair Credit Reporting Act.`

export const AUTHORIZATION_TEXT = `AUTHORIZATION

I acknowledge that I have received and read the standalone Disclosure Regarding Background Investigation, and the Summary of Your Rights Under the Fair Credit Reporting Act.

I hereby authorize ${COMPANY_NAME} to prepare, and the Employer to obtain, a consumer report about me as described in the Disclosure, for employment purposes. I understand this report reviews only publicly available online content, and that I may identify the social media accounts that belong to me to help ensure the report's accuracy.

I understand that I may request a copy of the report, that I have the right to dispute inaccurate or incomplete information, and that if the Employer intends to take adverse action based in whole or in part on the report, I will first be provided a copy of the report and a summary of my rights.

By typing my full legal name below and submitting, I am signing this authorization electronically, and I intend my electronic signature to have the same force and effect as a handwritten signature.`

// California's ICRAA requires offering the consumer a copy of the report and
// includes additional notice obligations. Shown to all candidates; the
// wants_copy checkbox is recorded either way.
export const CALIFORNIA_NOTICE = `CALIFORNIA NOTICE

Under California Civil Code section 1786.22, you are entitled to visit the Company's files concerning you during normal business hours, upon reasonable notice, and to receive a copy of your report. The Company will provide trained personnel to explain any information in your file, and you may be accompanied by one other person of your choosing. If you are a California resident, you may check the box in this form to receive a free copy of any report prepared about you.`

export const FCRA_SUMMARY_OF_RIGHTS_URL =
  'https://www.consumerfinance.gov/documents/summary-of-your-rights-under-the-fcra/'

// Shown at the bottom of the profiles step.
export const PROFILES_STEP_NOTE = `Providing your account links is voluntary and helps ensure the report reviews the right person's content. Only publicly visible content on the accounts you list (and public accounts reasonably matched to your identifying information) will be reviewed. Never share passwords — we will never ask for them.`
