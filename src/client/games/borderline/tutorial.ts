export const BORDERLINE_TUTORIAL_STEPS = [
  {
    seconds: 14,
    title: "YOUR FLAG, NOT AN ARMY",
    detail: "Hold provinces to score after every turn. Lose all your land? Re-enter through your home port.",
    narration: "You command a flag, not a standing army. Hold provinces to earn points after each turn. Lose all your land? Your home port lets you invade again.",
  },
  {
    seconds: 17,
    title: "THREE STRENGTH CARDS",
    detail: "Strength 1, 2 and 3. Use each card once; all three return after every three turns.",
    narration: "Your three strength cards are one, two and three. Pick one for each attack or defence. Use each once; all three return after every three turns.",
  },
  {
    seconds: 15,
    title: "BUILD YOUR ORDER",
    detail: "Choose Invade or Guard, a numbered province, then Strength. Strength is clash power, not soldiers on the map.",
    narration: "On your phone: choose Invade or Guard, then tap a numbered province. Choose your strength card. These numbers are attack strength, not soldiers stored on the map.",
  },
  {
    seconds: 16,
    title: "CONFIRM TO SEND",
    detail: "Tap Confirm order. Confirmed means safe. You may edit, then confirm again before time runs out.",
    narration: "Your order is not sent yet. Tap the glowing Confirm order button. When it says Confirmed, your order is safe. You can still edit it before time runs out.",
  },
  {
    seconds: 18,
    title: "WIN THE CLASH",
    detail: "Any Strength takes unguarded land. Beat a Guard to capture. Tied strongest attackers change nothing. Then practice.",
    narration: "Unguarded land can be taken by any strength. To capture guarded land, beat its strength. Tied strongest attackers change nothing. Now try a practice order.",
  },
] as const;

export const BORDERLINE_TUTORIAL_SECONDS = BORDERLINE_TUTORIAL_STEPS.reduce((total, step) => total + step.seconds, 0);

export function borderlineTutorialStep(phaseClock: number) {
  let boundary = 0;
  for (let index = 0; index < BORDERLINE_TUTORIAL_STEPS.length; index += 1) {
    boundary += BORDERLINE_TUTORIAL_STEPS[index].seconds;
    if (phaseClock < boundary) return index;
  }
  return BORDERLINE_TUTORIAL_STEPS.length - 1;
}
