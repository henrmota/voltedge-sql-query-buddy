import { BASE_SYSTEM_MESSAGE, SUPERVISOR_CONTEXTUALIZER_SYSTEM_MESSAGE, SUPERVISOR_INTENT_SYSTEM_MESSAGE } from "@/server/config/system-messages";
import { VectorStore } from "@/server/embeddings";
import { models } from "@/server/lib/model";
import { createDatabaseSchemaRags } from "@/server/lib/mysql";
import { ChainStepState, MessageStatus } from "@/types/server";
import "dotenv/config";
import { SystemMessage, HumanMessage } from "langchain";


const openAIApiKey = process.env.OPENAI_API_KEY;
if (!openAIApiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

createDatabaseSchemaRags({openAIApiKey, model: 'gpt-4o-mini'}).then(a => console.log(a));

const payload: ChainStepState = {
  question: "What are the top products by sales of all time?",
  history: [{
    role: "user", content: "Top Products by Sales of all time: Product A 500 products sold, Product B 300 products sold, Product C 200 products sold",
    id: "",
    createdAt: 0,
    status: MessageStatus.COMPLETED
  },
{
    role: "user", content: "Top Products by Sales this month: Product B 500 products sold, Product C 300 products sold, Product C 200 products sold",
    id: "",
    createdAt: 0,
    status: MessageStatus.COMPLETED
  }
],
  tables: [
    "potatoes",
    "tomatoes", 
    "orders",
  ]
}

const model = "gpt-4o-mini";
const key = process.env.OPENAI_API_KEY;
if (!key) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

await models.standard(model, key).invoke([
    new SystemMessage(BASE_SYSTEM_MESSAGE),
    new SystemMessage(SUPERVISOR_CONTEXTUALIZER_SYSTEM_MESSAGE),
    new HumanMessage(JSON.stringify(payload))
]).then(console.log);


