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

// ---------------------------------------------------------------------------
// Report + adverse action text (Phases 4-5). Same rule as above: placeholder
// language, structurally correct — swap for counsel-approved wording.
// ---------------------------------------------------------------------------

export const REPORT_COVER_NOTICE = `This consumer report was prepared by ${COMPANY_NAME} for employment purposes only, at the request of the end user identified on this cover page. It contains a review of publicly available social media and internet content only. No private accounts, private messages, or password-protected content were accessed.

This report excludes, by policy and by system design, information concerning race, color, religion, national origin, age, sex, sexual orientation, gender identity, disability, medical condition, pregnancy, genetic information, and lawful union activity.

NOTICE TO END USER: Before taking any adverse action based in whole or in part on this report, you must provide the consumer a copy of this report and the CFPB's "Summary of Your Rights Under the Fair Credit Reporting Act," and allow a reasonable period before taking final action. ${COMPANY_NAME} did not make, and cannot advise on, any employment decision. Use of this report is subject to your certifications under FCRA section 604(b).`

export const PRE_ADVERSE_EMAIL_TEXT = (candidateName: string, reportLink: string) => `Dear ${candidateName},

The employer that requested your pre-employment screening is considering an action that may be based, in whole or in part, on information in the enclosed consumer report prepared by ${COMPANY_NAME}.

No final decision has been made. Before any final decision, you have the right to review the report and to dispute any information in it that you believe is inaccurate or incomplete.

Your report: ${reportLink}
Summary of Your Rights Under the FCRA: ${FCRA_SUMMARY_OF_RIGHTS_URL}

To dispute any information in this report, reply to this email or contact ${COMPANY_NAME}. We will reinvestigate free of charge, generally within 30 days.

${COMPANY_NAME} is a consumer reporting agency. It did not make the employment decision and cannot explain the reasons for it.`

export const ADVERSE_EMAIL_TEXT = (candidateName: string, reportLink: string) => `Dear ${candidateName},

This notice is to inform you that an adverse employment action has been taken based, in whole or in part, on information in a consumer report prepared by ${COMPANY_NAME}.

${COMPANY_NAME}, as a consumer reporting agency, did not make this decision and is unable to provide you the specific reasons for it. Decisions were made solely by the employer.

You have the right to obtain a free copy of your report from ${COMPANY_NAME} within 60 days: ${reportLink}
You have the right to dispute directly with ${COMPANY_NAME} the accuracy or completeness of any information in the report. To do so, reply to this email.

Summary of Your Rights Under the FCRA: ${FCRA_SUMMARY_OF_RIGHTS_URL}`

// ---------------------------------------------------------------------------
// Report v2 text (cover page + FCRA page). Same rule: placeholder wording,
// swap for counsel-approved language.
// ---------------------------------------------------------------------------

// Printed in the cover footer.
export const COMPANY_WEBSITE = 'allstartalent.us'

// The short paragraph under "SOCIAL MEDIA REPORT" on the cover.
export const REPORT_COVER_SHORT = `This report has been prepared for lawful purposes solely for the end-user and individual identified above. It contains certain publicly available social media entries and internet content related to the individual. The report may be used by the end-user strictly in compliance with applicable federal, state, and local laws.`

// The asterisk line under it. (The sample report you modeled this on said
// "AI only, not reviewed by analyst" — this product is the opposite.)
export const REPORT_REVIEW_NOTE = `*AI tools assisted in locating content. Every flagged item in this report was individually reviewed and confirmed by a trained analyst.`

// Top of the FCRA page — the standard notice to users of consumer reports.
export const FCRA_USER_NOTICE = `All users of consumer reports must comply with all applicable regulations, including regulations promulgated after this notice was first prescribed in 2004. Information about applicable regulations currently in effect can be found at the Consumer Financial Protection Bureau's website: www.consumerfinance.gov`

export const FTC_EMPLOYER_GUIDE_URL =
  'https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-employers-need-know'

export const REPORT_DISCLAIMER = `This report has been prepared for lawful purposes solely for the end-user identified above. It contains certain social media entries and internet content related to the individual identified above. The information about the subject of this report was found exclusively in publicly available sources, including social media platforms and search engines. This report may be used by the end-user strictly in compliance with applicable federal, state, and local laws.`
