# CookMate End-to-End Test Run & Response Sheet

**Dish**: Pancakes (TheMealDB)  
**Features Covered**: Wake Word, Recipe Search, Paced Prep, Step Navigation, Technique Q&A (RAG), Ingredient Substitution (RAG), Kitchen Timers (Set, Check, Cancel), Step Jumping, and Session Finish.

---

### E2E Dialogue Matrix & Verification Sheet

| # | Feature Tested | Spoken Input (Say this) | Expected Response | Recorded CookMate Response | Result |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **01** | **Wake Word / PTT** | *"Hey Chef"* *(or press Spacebar)* | *"Hi! What would you like to cook today?"* | | [ ] Pass<br>[ ] Fail |
| **02** | **Recipe Discovery** | *"Find Pancakes"* | *"Found Pancakes. It takes about ... Ready to gather ingredients?"* | | [ ] Pass<br>[ ] Fail |
| **03** | **Paced Prep (Batch 1)** | *"Yes, I am ready"* | Announces first batch of ingredients (e.g. flour, milk) | | [ ] Pass<br>[ ] Fail |
| **04** | **Paced Prep (Batch 2)** | *"Got them"* | Announces next batch of ingredients (e.g. eggs, butter) | | [ ] Pass<br>[ ] Fail |
| **05** | **Start Cooking** | *"I have everything, let's start cooking"* | *"Step 1: ... "* (First cooking instruction) | | [ ] Pass<br>[ ] Fail |
| **06** | **RAG: Technique Query** | *"What does folding mean?"* | Explains folding batter gently & resumes Step 1 | | [ ] Pass<br>[ ] Fail |
| **07** | **Step Navigation** | *"Next step"* | Reads **Step 2** instruction | | [ ] Pass<br>[ ] Fail |
| **08** | **RAG: Substitution Query** | *"What can I substitute for milk?"* | Explains milk alternatives (e.g. oat milk, evaporated milk) & resumes Step 2 | | [ ] Pass<br>[ ] Fail |
| **09** | **Timer: Set** | *"Set a pancake timer for 2 minutes"* | *"Started a 2 minutes timer for pancake."* | | [ ] Pass<br>[ ] Fail |
| **10** | **Timer: Check** | *"How much time is left on my timer?"* | *"The pancake timer has ... left."* | | [ ] Pass<br>[ ] Fail |
| **11** | **Timer: Cancel** | *"Cancel the pancake timer"* | *"Cancelled the pancake timer."* | | [ ] Pass<br>[ ] Fail |
| **12** | **Step Jumping** | *"Jump to the last step"* | Confirms jump and reads the final recipe step | | [ ] Pass<br>[ ] Fail |
| **13** | **Session Finish** | *"All done, finished!"* | *"All steps completed. Enjoy your meal!"* | | [ ] Pass<br>[ ] Fail |
