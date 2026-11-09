# agent lab — online demo

A static build of the agent lab studio: a simulated chemistry lab where an LLM plans and runs experiments.
It replays runs recorded with the simulator. Pick an experiment in the prep library (each is labelled open / closed loop and
auto / needs human), press Start, and watch the bench being set up and the run in the 2.5D view. A subtitle says what is happening,
amounts float over where they are added, and each decision between rounds is marked with 🧠.

The recorded runs use the plan's rule calculator for decisions (shown as "⚙ The plan's rule"); with the full application the LLM decides.
Editing the bench, generating plans from paper links and live runs need the full application, which is not public.
