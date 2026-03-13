# Game Specification: "Roguelike Lemonade Stand"

## 1. Core Concept

A 2D, UI-driven roguelike business simulation. The player runs a lemonade stand, managing daily recipes, pricing, and inventory. The twist: the player must pay an exponentially increasing "Rent" every few days to survive. Between days, the player drafts "Cards" (upgrades/modifiers) that dramatically alter the business rules, allowing for complex synergies and builds such as high-reputation prestige or short-term scamming.

## 2. Game State Variables

The game needs to track the following global variables:

- **Day:** Current day number.
- **Money ($):** Player's current funds. Game over if `< $0` when rent is due.
- **Rent:** Amount due on the next Rent Day. Increases exponentially after every payment.
- **Rent Timer:** Number of days until rent is due.
- **Reputation:** A persistent value, ideally on a `0-100` scale.
  - **Effect:** Determines baseline Daily Customer Volume and Customer Price Tolerance.
- **Inventory:** Current stock of Lemons, Sugar, and Ice.
- **Active Cards:** List of permanent or temporary modifiers currently active.

## 3. The Core Loop (Daily Flow)

The game is played in discrete "Days" consisting of four phases:

### Phase 1: Morning (Setup)

- **Weather Forecast:** System rolls a random weather condition (`Sunny`, `Hot`, `Cloudy`, `Raining`). Weather affects baseline demand and ingredient preferences.
- **Purchasing:** Player buys ingredients (`Lemons`, `Sugar`, `Ice`) using Money. Costs may fluctuate.
- **Strategy:** Player sets the **Recipe** (`Lemons per cup`, `Sugar per cup`, `Ice per cup`) and the **Price** per cup.

### Phase 2: Day (Simulation)

- Start with an instant calculation, then later add a visual simulation of customers.
- **Customer Generation:** Base volume is determined by `Weather + Reputation + Card modifiers`.
- **Purchase Decision:** Each customer evaluates the Price and Recipe against the Weather and the player's Reputation.
- **Satisfaction Calculation:** If they buy, a Satisfaction score is generated based on how well the recipe matched the weather and how fair the price was.

### Phase 3: Evening (Results)

- Tally total cups sold, revenue generated, and ingredient waste (`Ice` melts daily, `Lemons` and `Sugar` persist).
- **Reputation Adjustment:** Average Customer Satisfaction modifies the global Reputation variable and can go up or down.
- **Rent Check:** If the Rent Timer hits `0`, subtract Rent from Money. If Money goes negative, trigger **Game Over**.

### Phase 4: Night (The Shop / Draft)

- Present 3 random **Cards**.
- Player selects 1 Card to add to their Active Cards. Some cards cost money, some are free.

## 4. Initial Card Deck (Modifiers)

These cards alter the base logic of the game. The architecture should support an event/listener system or modifier hooks so the effects are easy to extend.

### Type: Investment (Short-term loss, Long-term gain)

- **Loss Leader:** If price is set at or below ingredient cost, Reputation gains from Satisfaction are multiplied by 3.
- **Free Samples:** The first 10 customers of the day automatically buy at `$0`. Generates maximum Satisfaction.
- **PR Campaign:** Active for 3 days. Reputation cannot decrease, regardless of low Satisfaction.

### Type: Harvest (Burning reputation for cash)

- **Brand Premium:** Customers will purchase at prices 50% higher than your Reputation normally allows. However, every sale made at this premium reduces Reputation by a small flat amount.
- **Merchandising:** Evening Phase hook. Automatically gain Money equal to 10% of your current Reputation value.
- **Franchise Fee:** Instant effect upon drafting. Reduce current Reputation by 50%. Gain `$5` for every 1 point of Reputation lost.

### Type: Loyalty & Behavior

- **Punch Cards:** Every 5th customer pays `$0`. Passive: Reputation has a hard floor of 20 and cannot drop below it.
- **The Regulars:** Adds `+5` to Daily Customer Volume. These 5 customers bypass the Purchase Decision check and always buy, but generate `0` Satisfaction.
- **Trend Chasers:** Daily Customer Volume is multiplied by `2`. Passive: Reputation decays by 15% during the Evening phase unless the Recipe was changed from the previous day.

### Type: Recipe Tweakers

- **Organic Sourcing:** Lemons cost `2x` to purchase. Recipes using `>3` Lemons per cup generate `2x` Satisfaction and increase customer Price Tolerance.
- **High Fructose Corn Syrup:** Sugar costs 80% less. Passive: 5% chance during Evening Phase to trigger a "News Exposé," reducing Reputation by 30 points.

## 5. Development Milestones for Coding Agent

1. **Milestone 1:** Basic data structures and terminal/log output. Implement the Day Loop without cards. Hardcode a customer logic formula. Ensure rent increases and game-over works.
2. **Milestone 2:** Implement the Card System architecture. Create a base `Card` class with hooks for `OnMorning`, `OnPurchase`, and `OnEvening`. Implement 3 basic cards to test the hooks.
3. **Milestone 3:** UI Implementation. Build the visual interface for the Morning Setup, Evening Results, and Night Draft.
