import os
from langchain_openai import ChatOpenAI
from langchain.agents import initialize_agent, AgentType
from aipp_langchain.tools import AIPPTopupTool
from aipp.client import AIPP
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# We need an OpenAI API key for the LLM
os.environ["OPENAI_API_KEY"] = os.environ.get("OPENAI_API_KEY", "sk-your-openai-key")

# AIPP configurations
AIPP_API_KEY = os.environ.get("AIPP_API_KEY", "your-aipp-api-key")
AIPP_BASE_URL = os.environ.get("AIPP_BASE_URL", "https://api.aipp.dev")
ALBY_TOKEN = os.environ.get("ALBY_BEARER_TOKEN", "your-alby-token")

def main():
    print("🤖 Initializing Langchain Agent with AIPP Tool...")
    
    # 1. Initialize the AIPP Topup Tool
    aipp_tool = AIPPTopupTool(
        aipp_api_key=AIPP_API_KEY,
        aipp_base_url=AIPP_BASE_URL,
        wallet_type="alby",
        wallet_token=ALBY_TOKEN
    )
    
    # 2. Initialize the LLM
    llm = ChatOpenAI(temperature=0, model="gpt-4o-mini")
    
    # 3. Initialize the Agent
    tools = [aipp_tool]
    agent = initialize_agent(
        tools, 
        llm, 
        agent=AgentType.OPENAI_FUNCTIONS, 
        verbose=True
    )
    
    # Check current balance before running
    client = AIPP(api_key=AIPP_API_KEY, base_url=AIPP_BASE_URL)
    
    try:
        current_balance = client.balance()
        print(f"💰 Current AIPP Balance: {current_balance} credits")
    except Exception as e:
        print(f"❌ Failed to get balance: {e}")
        return

    print("\n🚀 Asking Agent to top up if balance is low...")
    
    # We ask the agent to act based on balance
    prompt = f"""
    My current AIPP credit balance is {current_balance}. 
    If the balance is less than 5, please use the aipp_topup tool to buy more credits (use the 'starter' plan).
    If the balance is 5 or more, just tell me I have enough credits.
    """
    
    response = agent.run(prompt)
    print("\n🎯 Agent Response:")
    print(response)
    
    # Check balance after
    try:
        new_balance = client.balance()
        print(f"\n💰 Final AIPP Balance: {new_balance} credits")
    except Exception as e:
        pass

if __name__ == "__main__":
    main()
