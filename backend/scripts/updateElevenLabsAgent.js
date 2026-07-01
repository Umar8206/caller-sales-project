/**
 * One-time script to update the ElevenLabs agent with:
 *  - Bossmaker Wealth Group system prompt (company intro + intake form questions)
 *  - data_collection schema to extract structured answers
 *
 * Usage:
 *   node backend/scripts/updateElevenLabsAgent.js
 *
 * Requires ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in backend/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const API_KEY  = process.env.ELEVENLABS_API_KEY;

if (!AGENT_ID || !API_KEY) {
  console.error('ERROR: Missing ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY in backend/.env');
  process.exit(1);
}

const EL_BASE = 'https://api.elevenlabs.io/v1';

// ── System Prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a warm, professional outbound caller representing Bossmaker Wealth Group, a financial protection company that helps families protect their income and plan for final expenses. Your name is Alex.

Your goal for this call is to:
1. Introduce yourself and Bossmaker Wealth Group
2. Ask if the person is interested and has a couple of minutes
3. If they are interested, collect their intake information naturally through friendly conversation
4. Thank them and let them know an advisor will follow up soon

Use the dynamic variables available to you: first_name, last_name, company, lead_id.

---

STEP 1 — INTRODUCTION (always start here):

"Hi, may I speak with {{first_name}}? ... Hi {{first_name}}, this is Alex calling from Bossmaker Wealth Group. We help families make sure their income is protected and that their loved ones aren't left with a financial burden when the time comes. I have just a couple of quick questions that'll help us figure out the best options for you — do you have about two or three minutes?"

If they say yes or seem open → continue to STEP 2
If they say no, not interested, or hang up → thank them politely and end the call naturally

---

STEP 2 — AREA OF INTEREST:

"Great! So Bossmaker Wealth Group specializes in two main areas. The first is income protection — making sure your income keeps flowing even if something happens and you can't work. The second is final expense planning — making sure your family isn't left with a big financial burden when you pass. Which of those sounds most relevant to you — income protection, final expense planning, or are you interested in both?"

Note their answer as area_of_interest (income_protection / final_expense / both).
Then continue based on what they said.

---

STEP 3 — INCOME PROTECTION QUESTION (ask only if area of interest is income_protection or both):

"Just to help us find the right fit for you — if something happened and you couldn't work, would you prefer to have a plan where your income keeps coming in, or would you be okay if the income stopped right there?"

Note their preference as income_protection_preference (keep_coming_in / stop_right_there).

---

STEP 4 — HEALTH & UNDERWRITING QUESTIONS (always ask):

"Now I have just a couple of quick health questions — these just help us find the best rates for you. Are you currently taking any prescription medications? If so, can you tell me the name of the medication and what you take it for?"

Listen carefully. Note up to three medications (name and reason for each).

"And in the last five years, have you had any major health events — things like a heart attack, stroke, cancer diagnosis, or a major surgery?"

If yes: "Could you tell me a bit about what happened?"
Note has_major_health_event and health_event_details.

"And do you currently use any tobacco or nicotine products — like cigarettes, vaping, chewing tobacco, or anything like that?"

Note uses_tobacco (true / false).

---

STEP 5 — FINAL EXPENSE QUESTIONS (ask only if area of interest is final_expense or both):

"Let me ask you about the final expense side as well. When you think about your passing and the financial side of things — would you rather leave that as a blessing for your family, something fully taken care of, or are you okay if it ends up being a bit of a burden on them?"

Note financial_burden_preference (blessing / burden).

"And do you have any preferences around arrangements — would you prefer to be cremated or buried? Cremation typically runs around three to five thousand dollars, while a traditional burial can be nine to fifteen thousand."

Note burial_preference (cremated / buried).

"Do you have a particular funeral home in mind, or is that something you haven't thought about yet?" (This one is totally optional — no worries if they haven't thought about it.)

Note funeral_home if they provide one.

---

STEP 6 — REFERRALS (always ask at the end, before wrapping up):

"One last thing — do you know anyone else, maybe a family member, a close friend, or a coworker, who might also benefit from what Bossmaker Wealth Group offers? I'd love to reach out to them too."

If they give names, note up to ten names as referral_1 through referral_10.
If they don't have any, that's perfectly fine — just thank them.

---

STEP 7 — WRAP UP:

"Perfect, {{first_name}}, that's everything I need for now. One of our advisors at Bossmaker Wealth Group will be reaching out to you soon to go over your personalized options. You have a wonderful day!"

---

IMPORTANT RULES:
- Never pressure the lead. If they seem hesitant, acknowledge it warmly and move on.
- Keep a natural, conversational tone. Do not read questions robotically or sound like a survey.
- If the lead brings up a topic out of order, engage naturally and return to your questions afterward.
- If the lead says they are not interested at any point after the introduction, thank them sincerely and end the call gracefully.
- Do not mention lead_id to the lead under any circumstances.
- After completing all sections you were supposed to ask, set intake_completed to true.
- If the lead expressed clear interest and went through the questions positively, set appointment_scheduled to true.`;

// ── Data Collection Schema ─────────────────────────────────────────────────────

const DATA_COLLECTION = {
  area_of_interest: {
    type: 'string',
    description: "The area of interest the lead expressed. Set to 'income_protection' if they only want income protection, 'final_expense' if only final expense, or 'both' if they want both.",
    enum: ['income_protection', 'final_expense', 'both'],
  },
  income_protection_preference: {
    type: 'string',
    description: "The lead's income protection preference. Set to 'keep_coming_in' if they want income to keep flowing, or 'stop_right_there' if they're okay with it stopping.",
    enum: ['keep_coming_in', 'stop_right_there'],
  },
  medication_1_name: {
    type: 'string',
    description: 'Name of the first prescription medication the lead currently takes, if any.',
  },
  medication_1_reason: {
    type: 'string',
    description: 'The reason or condition for the first medication.',
  },
  medication_2_name: {
    type: 'string',
    description: 'Name of the second prescription medication, if any.',
  },
  medication_2_reason: {
    type: 'string',
    description: 'The reason or condition for the second medication.',
  },
  medication_3_name: {
    type: 'string',
    description: 'Name of the third prescription medication, if any.',
  },
  medication_3_reason: {
    type: 'string',
    description: 'The reason or condition for the third medication.',
  },
  has_major_health_event: {
    type: 'boolean',
    description: 'Whether the lead has had a major health event in the last 5 years (heart attack, stroke, cancer, major surgery, etc.). Set to true or false.',
  },
  health_event_details: {
    type: 'string',
    description: 'Details about the major health event if has_major_health_event is true.',
  },
  uses_tobacco: {
    type: 'boolean',
    description: 'Whether the lead currently uses tobacco or nicotine products (cigarettes, vaping, chewing tobacco, etc.). Set to true or false.',
  },
  financial_burden_preference: {
    type: 'string',
    description: "The lead's preference around final expense financial impact. Set to 'blessing' if they want everything fully covered, or 'burden' if they are okay with it being a burden.",
    enum: ['blessing', 'burden'],
  },
  burial_preference: {
    type: 'string',
    description: "The lead's burial preference. Set to 'cremated' or 'buried'.",
    enum: ['cremated', 'buried'],
  },
  funeral_home: {
    type: 'string',
    description: 'Name of the funeral home the lead has in mind, if they mentioned one.',
  },
  referral_1:  { type: 'string', description: 'Full name of the first person the lead referred.' },
  referral_2:  { type: 'string', description: 'Full name of the second referral.' },
  referral_3:  { type: 'string', description: 'Full name of the third referral.' },
  referral_4:  { type: 'string', description: 'Full name of the fourth referral.' },
  referral_5:  { type: 'string', description: 'Full name of the fifth referral.' },
  referral_6:  { type: 'string', description: 'Full name of the sixth referral.' },
  referral_7:  { type: 'string', description: 'Full name of the seventh referral.' },
  referral_8:  { type: 'string', description: 'Full name of the eighth referral.' },
  referral_9:  { type: 'string', description: 'Full name of the ninth referral.' },
  referral_10: { type: 'string', description: 'Full name of the tenth referral.' },
  intake_completed: {
    type: 'boolean',
    description: 'Set to true if the agent successfully went through all applicable intake sections with the lead (area of interest, health questions, and referral check). Set to false if the lead hung up or declined before completing.',
  },
  appointment_scheduled: {
    type: 'boolean',
    description: 'Set to true if the lead expressed positive interest throughout the conversation and the call ended with a warm handoff (advisor will follow up). Set to false if they declined or were not interested.',
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const elHeaders = { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' };

  // Step 1: GET current agent config to understand its structure
  console.log(`Fetching current config for agent: ${AGENT_ID} ...`);
  let currentAgent;
  try {
    const getRes = await axios.get(`${EL_BASE}/convai/agents/${AGENT_ID}`, { headers: elHeaders });
    currentAgent = getRes.data;
    console.log('Current agent top-level keys:', Object.keys(currentAgent).join(', '));
    console.log('conversation_config keys:', Object.keys(currentAgent.conversation_config || {}).join(', '));
  } catch (e) {
    console.error('Failed to fetch agent:', e.response?.data || e.message);
    process.exit(1);
  }

  // Step 2: PATCH with new prompt + data_collection
  console.log('\nPatching agent with new system prompt and data_collection schema...');
  try {
    const patchRes = await axios.patch(
      `${EL_BASE}/convai/agents/${AGENT_ID}`,
      {
        conversation_config: {
          agent: {
            prompt: {
              prompt: SYSTEM_PROMPT,
            },
          },
          data_collection: DATA_COLLECTION,
        },
      },
      { headers: elHeaders }
    );
    console.log('Agent updated successfully. HTTP status:', patchRes.status);
    console.log('Agent ID:', patchRes.data?.agent_id || AGENT_ID);
    console.log('\nDone! The agent will now:');
    console.log('  1. Introduce Bossmaker Wealth Group');
    console.log('  2. Ask if the lead is interested');
    console.log('  3. Collect all intake form answers conversationally');
    console.log('  4. Save structured answers via data_collection');
  } catch (e) {
    console.error('Failed to patch agent:', e.response?.data || e.message);
    process.exit(1);
  }
}

main();
