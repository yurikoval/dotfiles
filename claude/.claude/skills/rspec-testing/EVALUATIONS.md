# RSpec Testing Skill Evaluations

This document contains test scenarios to evaluate the skill's effectiveness. Each scenario includes:
- **Input**: What to ask Claude
- **Expected Output**: What Claude should produce
- **Success Criteria**: How to measure success

## Evaluation 1: New Service Test (Baseline)

**Scenario:** Testing a simple service from scratch.

**Input:**
```
Write RSpec tests for this OrderProcessor class:

class OrderProcessor
  def initialize(payment_gateway)
    @payment_gateway = payment_gateway
  end

  def process(order)
    return false if order.total <= 0
    return false unless order.valid?

    @payment_gateway.charge(order.user, order.total)
  end
end
```

**Expected Behavior:**

1. **Identifies what to test:**
   - Public method `#process`
   - Behavioral outcomes (not internal calls to gateway)
   - Edge cases: invalid total, invalid order, valid order

2. **Creates characteristic-based hierarchy:**
   ```ruby
   describe OrderProcessor do
     describe '#process' do
       subject(:process_order) { processor.process(order) }

       let(:processor) { described_class.new(payment_gateway) }
       let(:payment_gateway) { instance_double(PaymentGateway) }

       context 'when order total is zero or negative' do
         # ...
       end

       context 'when order is invalid' do
         # ...
       end

       context 'when order is valid' do
         # happy path first
       end
     end
   end
   ```

3. **Uses proper structure:**
   - Named subject for the method under test
   - Contexts organized by characteristics (order validity, total value)
   - Happy path before edge cases
   - Tests behavior (return values), not implementation (doesn't test `expect(gateway).to receive(:charge)`)

**Success Criteria:**

- ✅ Tests behavior, not implementation
- ✅ Uses characteristic-based context hierarchy
- ✅ Happy path comes before edge cases
- ✅ Uses named subject
- ✅ Proper RSpec syntax (describe/context/it)
- ✅ No mixed phases in `it` blocks
- ✅ Runs validation (linter + tests) at the end

**Scoring:**
- **Excellent (9-10/10)**: All criteria met
- **Good (7-8/10)**: Minor issues (e.g., happy path not first, but structure correct)
- **Needs Improvement (5-6/10)**: Tests implementation or missing context hierarchy
- **Poor (<5/10)**: Tests internal method calls, no contexts, mixed phases

---

## Evaluation 2: Edge Case Addition

**Scenario:** Adding a new edge case to existing tests.

**Input:**
```
Add a test case for when the payment gateway is unavailable (raises PaymentGateway::Unavailable error).
The processor should return false and not crash.

Current tests:
[provide the tests from Evaluation 1]
```

**Expected Behavior:**

1. **Identifies correct location:**
   - New context at same level as "when order is valid"
   - After happy path contexts

2. **Follows existing structure:**
   ```ruby
   context 'when payment gateway is unavailable' do
     let(:order) { create(:order, :valid, total: 100) }

     before do
       allow(payment_gateway).to receive(:charge)
         .and_raise(PaymentGateway::Unavailable)
     end

     it 'returns false' do
       expect(process_order).to be false
     end
   end
   ```

3. **Maintains consistency:**
   - Uses same naming conventions
   - Follows characteristic-based organization
   - Places error case after happy path

**Success Criteria:**

- ✅ New context at correct hierarchy level
- ✅ Follows existing naming conventions
- ✅ Positioned after happy path
- ✅ Uses `before` for setup (preparing gateway to raise error)
- ✅ Tests behavior (return value), not implementation
- ✅ Runs validation after changes

**Scoring:**
- **Excellent (9-10/10)**: All criteria met
- **Good (7-8/10)**: Correct behavior but minor style issues
- **Needs Improvement (5-6/10)**: Wrong hierarchy level or tests implementation
- **Poor (<5/10)**: Tests internal calls or breaks existing structure

---

## Evaluation 3: Refactor Implementation Test

**Scenario:** Fixing a test that checks implementation instead of behavior.

**Input:**
```
Refactor this test to follow BDD principles:

describe NotificationService do
  describe '#notify' do
    it 'sends email via mailer' do
      user = create(:user)
      mailer = instance_double(Mailer)
      service = NotificationService.new(mailer)

      expect(mailer).to receive(:send_email).with(user.email, anything)

      service.notify(user, 'Welcome!')
    end
  end
end
```

**Expected Behavior:**

1. **Identifies the problem:**
   - Tests implementation (`receive(:send_email)`)
   - Should test observable behavior instead

2. **Proposes behavior-focused alternative:**
   ```ruby
   describe NotificationService do
     describe '#notify' do
       subject(:notify_user) { service.notify(user, message) }

       let(:service) { described_class.new(mailer) }
       let(:mailer) { instance_double(Mailer, send_email: true) }
       let(:user) { create(:user) }
       let(:message) { 'Welcome!' }

       it 'returns success' do
         expect(notify_user).to be_success
       end

       # OR if the service doesn't return a value:
       it 'completes without errors' do
         expect { notify_user }.not_to raise_error
       end
     end
   end
   ```

3. **Explains the change:**
   - Why the original was testing implementation
   - What observable behavior we test instead
   - When implementation testing might be acceptable (boundary testing)

**Success Criteria:**

- ✅ Identifies implementation testing anti-pattern
- ✅ Proposes behavior-focused alternative
- ✅ Uses named subject
- ✅ Separates phases (let for setup, it for assertion)
- ✅ Explains the reasoning

**Scoring:**
- **Excellent (9-10/10)**: All criteria met with clear explanation
- **Good (7-8/10)**: Correct refactoring but explanation could be clearer
- **Needs Improvement (5-6/10)**: Still tests implementation or no explanation
- **Poor (<5/10)**: Doesn't recognize the problem

---

## Evaluation 4: Complex Characteristic Hierarchy

**Scenario:** Organizing tests with multiple dependent characteristics.

**Input:**
```
Write tests for DiscountCalculator#calculate:

class DiscountCalculator
  def calculate(user, order)
    return 0 if order.total < 50

    if user.segment == 'b2c'
      user.premium? ? 20 : 5
    else
      user.premium? ? 15 : 10
    end
  end
end
```

**Expected Behavior:**

1. **Maps characteristics correctly:**
   - Level 1: Order total (< 50 vs >= 50)
   - Level 2: User segment (b2c vs b2b)
   - Level 3: Premium status (premium vs regular)

2. **Creates proper hierarchy:**
   ```ruby
   describe DiscountCalculator do
     describe '#calculate' do
       subject(:discount) { calculator.calculate(user, order) }

       let(:calculator) { described_class.new }

       context 'when order total is below minimum' do
         let(:order) { create(:order, total: 40) }
         let(:user) { create(:user) }

         it { is_expected.to eq(0) }
       end

       context 'when order total meets minimum' do
         let(:order) { create(:order, total: 100) }

         context 'when user segment is b2c' do
           context 'with premium subscription' do
             let(:user) { create(:user, :b2c, :premium) }

             it { is_expected.to eq(20) }
           end

           context 'without premium subscription' do
             let(:user) { create(:user, :b2c) }

             it { is_expected.to eq(5) }
           end
         end

         context 'when user segment is b2b' do
           context 'with premium subscription' do
             let(:user) { create(:user, :b2b, :premium) }

             it { is_expected.to eq(15) }
           end

           context 'without premium subscription' do
             let(:user) { create(:user, :b2b) }

             it { is_expected.to eq(10) }
           end
         end
       end
     end
   end
   ```

3. **Key features:**
   - Happy path first (order meets minimum)
   - One characteristic per context level
   - Uses traits to match context descriptions
   - Clear nesting shows dependencies

**Success Criteria:**

- ✅ Correct characteristic ordering (order total → segment → premium)
- ✅ Happy path before edge cases
- ✅ One characteristic per nesting level
- ✅ Uses factory traits matching contexts
- ✅ Named subject with `is_expected`
- ✅ No duplicate setup across sibling contexts

**Scoring:**
- **Excellent (9-10/10)**: Perfect hierarchy, all criteria met
- **Good (7-8/10)**: Correct hierarchy but minor style issues
- **Needs Improvement (5-6/10)**: Wrong characteristic ordering or missing contexts
- **Poor (<5/10)**: Flat structure without proper hierarchy

---

## Evaluation 5: Realistic Integration Test

**Scenario:** Request spec with proper domain-based combining.

**Input:**
```
Write request specs for POST /api/orders endpoint:

- Requires authentication
- Requires user to have active subscription
- Creates order if product is available
- Returns 422 if product out of stock
- Returns 422 if invalid parameters
```

**Expected Behavior:**

1. **Identifies layers:**
   - Authentication layer
   - Authorization layer (subscription)
   - Business domain (order creation)

2. **Combines within domain:**
   ```ruby
   describe 'POST /api/orders' do
     let(:user) { create(:user, :authenticated) }
     let(:headers) { { 'Authorization' => "Bearer #{user.token}" } }

     context 'when user is not authenticated' do
       let(:headers) { {} }

       it 'returns 401' do
         post '/api/orders', params: order_params, headers: headers
         expect(response).to have_http_status(:unauthorized)
       end
     end

     context 'when user lacks active subscription' do
       let(:user) { create(:user, :authenticated, subscription: nil) }

       it 'returns 403' do
         post '/api/orders', params: order_params, headers: headers
         expect(response).to have_http_status(:forbidden)
       end
     end

     context 'when user is authenticated and authorized' do
       let(:user) { create(:user, :authenticated, :with_subscription) }

       context 'with valid parameters and available product' do
         let(:product) { create(:product, :available) }
         let(:order_params) { { product_id: product.id, quantity: 1 } }

         it 'creates order and returns 201' do
           expect {
             post '/api/orders', params: order_params, headers: headers
           }.to change(Order, :count).by(1)

           expect(response).to have_http_status(:created)
         end
       end

       context 'when product is out of stock' do
         let(:product) { create(:product, :out_of_stock) }
         let(:order_params) { { product_id: product.id, quantity: 1 } }

         it 'returns 422 with error' do
           post '/api/orders', params: order_params, headers: headers

           expect(response).to have_http_status(:unprocessable_entity)
           expect(json_response['error']).to eq('Product out of stock')
         end
       end

       context 'with invalid parameters' do
         let(:order_params) { { quantity: -1 } }

         it 'returns 422 with validation errors' do
           post '/api/orders', params: order_params, headers: headers

           expect(response).to have_http_status(:unprocessable_entity)
         end
       end
     end
   end
   ```

3. **Key features:**
   - One test per auth/authz layer (not exhaustive)
   - Business domain tests within authorized context
   - Happy path first within business domain
   - Uses aggregate_failures for interface testing (status + body)

**Success Criteria:**

- ✅ Proper layer structure (auth → authz → business)
- ✅ One corner case per non-business layer
- ✅ Multiple scenarios only in business domain
- ✅ Happy path first within business domain
- ✅ Uses factory traits matching contexts
- ✅ No duplicate unit-level tests

**Scoring:**
- **Excellent (9-10/10)**: Perfect layering and domain combining
- **Good (7-8/10)**: Correct structure but tests too much in auth layers
- **Needs Improvement (5-6/10)**: Flat structure or duplicates unit tests
- **Poor (<5/10)**: No clear layers or exhaustive testing at each layer

---

## Tracking Results

Use this table to track evaluation results:

| Evaluation | Date | Score | Notes |
|------------|------|-------|-------|
| 1. New Service Test | | /10 | |
| 2. Edge Case Addition | | /10 | |
| 3. Refactor Implementation | | /10 | |
| 4. Complex Hierarchy | | /10 | |
| 5. Integration Test | | /10 | |
| **Average** | | /10 | |

**Target Score:** 8.0/10 or higher indicates the skill effectively guides Claude to write tests following the style guide.

---

## Notes for Testing

1. **Context Freshness**: Start each evaluation in a new conversation or clear context
2. **Minimal Input**: Provide only the scenario input, don't hint at solutions
3. **Validation**: Check if Claude runs linter/tests at the end
4. **Explanation Quality**: Note if Claude explains reasoning behind choices
5. **Consistency**: Test multiple times to check for consistent behavior

## Improvement Tracking

When scores are below target, identify patterns:

- **Consistently misses happy path ordering** → Strengthen Rule 3 in SKILL.md
- **Tests implementation frequently** → Add more anti-pattern examples
- **Wrong characteristic hierarchy** → Improve decision tree for context organization
- **Skips validation** → Make validation workflow more prominent
