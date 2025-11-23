# VoltEdge Query Buddy

A full-stack LLM-powered SQL query assistant built with Next.js, TypeScript, and LangChain. This application allows users to query a MySQL database using natural language, with intelligent routing, SQL generation, validation, and result analysis.

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose
- Make (optional, but recommended)

### Running the Project

1. **Build the production Docker images:**
   ```bash
   make build-prod
   ```

2. **Start all services (MySQL, Redis, and the app):**
   ```bash
   make prod
   ```

3. **Access the application:**
   - Open your browser to `http://localhost:3001`
   - You'll be prompted to enter your OpenAI API key (stored securely in local database only)
   - The database will be automatically initialized with sample data on first run

### Development Mode

For development with hot-reload:

```bash
make dev
# or
make up
```

### Other Useful Commands

```bash
make help          # Show all available commands
make logs-prod     # View production logs
make down-prod     # Stop production containers
make clean         # Remove all containers and volumes
```

## 🎯 Why JavaScript/TypeScript?

I chose to build this project in JavaScript/TypeScript as a personal challenge. While Python has a more mature ecosystem for LLM applications, I wanted to:

1. **Challenge myself** - Push the boundaries of what's possible with JavaScript in the LLM space
2. **Full-stack expertise** - As a full-stack developer, I wanted to learn how to integrate LLMs into my own applications without switching languages
3. **Unified codebase** - Keep everything in one language for easier maintenance and deployment

**Note:** I did experiment with Python implementations during development to validate concepts and compare approaches. The choice of JavaScript/TypeScript wasn't about disliking Python (which is excellent for LLM work), but rather about challenging myself to build a complete LLM application in my primary stack.

This project demonstrates that JavaScript/TypeScript can be a viable choice for LLM applications, especially when you need tight integration with web applications.

## 🧠 What I Learned About LLMs

Building this project gave me deep insights into how LLMs actually work:

### Core Understanding
**LLMs are essentially next-word predictors with a massive training dataset.** They don't "understand" in the traditional sense - they predict the most likely next token based on patterns learned from training data.

### Key Insights

1. **Prompt Engineering is Context Manipulation**
   - By placing specific text before what we want to generate, we can guide the model to the desired outcome
   - The context (system messages, examples, instructions) shapes the probability distribution of outputs

2. **Separation of Concerns**
   - **Don't mix creative and deterministic prompts** in the same request
   - Creative tasks (like generating insights) need different prompting than deterministic tasks (like SQL generation)
   - Each step in the chain has a focused, single responsibility

3. **Garbage In, Garbage Out**
   - This principle is especially true for LLMs
   - Poorly structured prompts lead to unpredictable outputs
   - Clear, specific instructions with examples produce reliable results
   - The quality of your system messages directly impacts the quality of outputs

4. **Chain Architecture Over Agents**
   - While agents are powerful, they introduce unpredictability
   - For deterministic workflows (like SQL query generation), a chain with explicit routing provides better control and debuggability
   - Each step can be tested and optimized independently

## 🔧 Technical Decisions

### Transformer.js for Embeddings

I decided to use **Transformer.js** (Hugging Face Transformers in JavaScript) for embeddings instead of relying solely on OpenAI's embedding API. This decision was driven by:

1. **Cost Reduction** - Running embeddings locally eliminates API costs for embedding operations
2. **Integration Diversity** - Exploring tools beyond frontier models (OpenAI, Anthropic, etc.)
3. **Performance** - Local embeddings are fast and don't require network calls
4. **Learning** - Understanding how embeddings work at a lower level

The embeddings are used for RAG (Retrieval Augmented Generation) to find relevant database schema information based on user queries.

### Redis for Vector Database and Memory

**Redis** serves a dual purpose in this application:

1. **Vector Database** - Using Redis Stack with vector search capabilities, Redis stores and indexes embeddings for RAG. When a user asks a question, the system:
   - Generates embeddings for the query using Transformer.js
   - Searches Redis for similar database schema documents
   - Retrieves relevant table/column information to guide SQL generation

2. **Conversation Memory** - Redis stores all conversation history and messages:
   - Messages are stored in Redis lists for each conversation
   - Conversation metadata is maintained in sorted sets for efficient retrieval
   - This provides fast access to conversation context without querying a traditional database

This dual usage makes Redis a critical component for both the RAG pipeline and maintaining conversation state, providing fast, in-memory access to both vector embeddings and conversation data.

### Database Schema and Anomaly Testing

The database schema includes **coupons** and **coupon_redemptions** tables specifically designed to test anomaly detection capabilities. The system seeds the database with:

- **Normal coupons** - Standard discount coupons (5-25% discount) applied to regular orders
- **Anomaly coupons** - Negative discount coupons that actually increase order totals instead of decreasing them

These anomaly coupons create data anomalies that the LLM can detect and report in insights. For example, when analyzing coupon usage, the system can identify suspicious patterns like:
- Orders where a "discount" actually increased the total amount
- Negative discount values that should be flagged as errors
- Unusual redemption patterns

This schema design allows testing the system's ability to identify and report data quality issues and anomalies in business data, demonstrating how LLMs can be used for data validation and anomaly detection beyond just querying.

### Server Sent Events (SSE) for Real-Time Communication

The application uses **Server Sent Events (SSE)** to provide real-time updates to the frontend during chain execution. This allows users to see:

- **Thinking indicators** - Shows which step is currently executing
- **Streaming responses** - Displays results as they're generated
- **Progress updates** - Real-time feedback on query execution and analysis

SSE is implemented using Next.js API routes and the native `EventSource` API in the browser. This provides a lightweight, efficient way to stream updates without the overhead of WebSockets, perfect for one-way server-to-client communication.

### Chain + Routing Architecture

Instead of using autonomous agents, I implemented a **chain-based architecture with intelligent routing**:

- **Predictability** - The entire flow is deterministic and traceable
- **Debuggability** - Each step can be logged and inspected
- **Control** - Explicit routing decisions based on intent classification
- **Performance** - No unnecessary LLM calls or tool invocations

The architecture routes requests based on intent:
- `sql-analysis` → Full data analysis chain
- `direct-answer` → Simple LLM response from conversation history
- `none` → Default response

## ✅ Good Decisions

Throughout the development of this project, several architectural decisions proved to be particularly effective:

### Backend Message History Management

**Backend stores and retrieves message history from Redis** - Instead of requiring the frontend to send the entire conversation history with each request, the backend maintains conversation state in Redis. This approach:

- **Reduces payload size** - Frontend only sends the new message, not the entire history
- **Single source of truth** - Backend controls conversation state, preventing inconsistencies
- **Better performance** - No need to serialize/deserialize large message arrays on every request
- **Easier debugging** - All conversation data is centralized and accessible

### History Summarization

**Conversation history is summarized** - Before processing, the system summarizes conversation history to reduce token usage. This works well for this project, but:

- **Token efficiency** - Summarization significantly reduces the number of tokens sent to the LLM
- **Context preservation** - Important information is retained while removing redundancy
- **Project-specific** - For this simple project, summarization works effectively, but more testing would be needed for complex, multi-turn conversations in production systems
- **Trade-offs** - There's a balance between token savings and potential information loss that needs careful consideration

### SSE vs WebSockets

**Server Sent Events (SSE) over WebSockets** - Chose SSE for real-time updates because:

- **Less overhead** - SSE is simpler and lighter than WebSockets for one-way communication
- **Easier implementation** - Native browser support with `EventSource`, no complex connection management
- **Perfect fit** - One-way server-to-client updates don't need bidirectional communication
- **Automatic reconnection** - Browsers handle SSE reconnection automatically

### Step-by-Step Visibility

**Showing each step while final message is not streamed** - The system displays intermediate steps (thinking indicators, SQL generation, query execution) before the final answer:

- **Transparency** - Users see exactly what's happening at each stage
- **Better UX** - Reduces perceived wait time by showing progress
- **Debugging** - Makes it easier to identify where issues occur in the chain
- **Trust** - Users understand how the answer was generated, not just the final result

These decisions collectively contribute to a more efficient, maintainable, and user-friendly system.

## 📊 Architecture Flow

Here's the complete chain flow in ASCII:

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER QUESTION                            │
└────────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  SUPERVISOR CHAIN    │
                    └─────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Contextualize   │
                    │    Question      │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   Intent         │
                    │ Classification   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │     Routing      │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ sql-analysis│    │direct-answer │    │    none     │
│   (route)   │    │   (route)    │    │   (route)   │
└──────┬──────┘    └──────┬───────┘    └──────┬──────┘
       │                   │                   │
       │                   │                   │
       ▼                   │                   │
┌──────────────────────────┐│                   │
│  DATA ANALYSIS CHAIN      ││                   │
└──────────────────────────┘│                   │
       │                     │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│   History    │             │                   │
│  Summarizer  │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│     RAG      │             │                   │
│ (Embeddings) │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│   SQL        │             │                   │
│   Planner    │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│  SQL         │             │                   │
│  Validator   │             │                   │
│  (EXPLAIN)   │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│   Query      │             │                   │
│   Executor   │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│   Result     │             │                   │
│   Sampler    │             │                   │
│(Top+Bottom)  │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       ▼                     │                   │
┌──────────────┐             │                   │
│   Insights   │             │                   │
│   Generator  │             │                   │
└──────┬───────┘             │                   │
       │                     │                   │
       └─────────────────────┴───────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Output Formatter │
                    │  (Final Answer)  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   USER RESPONSE  │
                    └──────────────────┘
```

### Chain Steps Explained

**Supervisor Chain:**
1. **Contextualize** - Adds context from conversation history to the question
2. **Intent** - Classifies the question type (sql-analysis, direct-answer, none)
3. **Routing** - Routes to appropriate handler based on intent
4. **Output Formatter** - Formats the final response for the user

**Data Analysis Chain** (when routed to sql-analysis):
1. **History Summarizer** - Summarizes conversation history to reduce token usage
2. **RAG** - Retrieves relevant database schema using embeddings
3. **SQL Planner** - Generates SQL queries based on question and schema
4. **SQL Validator** - Validates queries using MySQL EXPLAIN
5. **Query Executor** - Executes validated SQL queries
6. **Result Sampler** - Samples large result sets (top + bottom rows)
7. **Insights** - Generates natural language insights from results

## 💡 Example Queries

Here are some suggested and tested prompts that demonstrate different capabilities of the system:

### Performance Analysis
```
Give me the top 10 most performant products
```
This query tests the system's ability to:
- Generate complex SQL with ordering and limiting
- Handle performance metrics calculations
- Provide insights on top-performing items

### Large Result Set Handling
```
Give me products prices
```
This query demonstrates:
- **Result sampling** - When results exceed 100 rows, the system samples the top and bottom rows
- Efficient handling of large datasets
- Clear indication when results are sampled vs. complete

### Comparative Analysis
```
Analyze product price vs performance
```
This query showcases:
- Multi-dimensional analysis
- Cross-column comparisons
- Insight generation from relationships between metrics
- Chart generation for visual representation

These examples highlight the system's ability to handle various query types, from simple data retrieval to complex analytical questions.

## 🔮 Future Improvements

### Error Handling
- **Improve Frontend** - Better error messages and retry mechanisms
- **Error Recovery** - Restart the chain on failures, passing the error context to avoid repeated mistakes
- **Graceful Degradation** - Fallback strategies when steps fail

### Performance
- **Caching** - Cache RAG results and SQL plans for similar queries
- **Parallel Execution** - Run independent steps in parallel where possible
- **Streaming** - Stream intermediate results to the frontend

### User Experience
- **Query History** - Show previous queries and results
- **Query Explanation** - Explain how SQL was generated
- **Result Export** - Export query results to CSV/JSON
- **Query Validation Feedback** - Show why queries were rejected
- **Graph Improvements** - Enhance chart visualizations (currently using Chart.js) with better styling, interactivity, and data representation

### Architecture
- **Step Retry Logic** - Automatic retry with exponential backoff
- **Monitoring** - Add metrics and tracing for each chain step
- **A/B Testing** - Test different prompt variations
- **Multi-database Support** - Support for PostgreSQL, SQLite, etc.

## 📝 License

Unlicense - See LICENSE file for details

## 🙏 Acknowledgments

Built as a learning project to explore LLM integration in full-stack JavaScript applications.
