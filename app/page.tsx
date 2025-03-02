"use client"
import Image from "next/image"
import f1bot from "./assets/f1bot.png"
import { useChat } from "ai/react"
import { Message } from "ai"
import Bubble from "./components/Bubble"
import LoadingBubble from "./components/LoadingBubble"
import PromptSuggestionRow from "./components/PromptSuggestionRow"

const Home = () => {

    const {append, isLoading, messages, input, handleInputChange, handleSubmit} = useChat()

    const noMessages = !messages || messages.length === 0;

    const handlePrompt = ( promptText ) => {
        const msg: Message={
            id: crypto.randomUUID(),
            content: promptText,
            role: "user"
        }
        append(msg)
    }

    return(
        <main>
            <Image src={f1bot} width="250" alt="F1BOT logo"></Image>
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <>
                        <p className="starter-text">
                            The Ultimate place for Formula One fans!
                            Ask F1BOT anything about the F1 world of racing 
                            and it will come back with the most up-to-date answers.
                            So let's chat!
                        </p>
                        <br/>
                        <PromptSuggestionRow onPromptClick={handlePrompt}/>
                        </>
                ):(
                    <>
                       {messages.map((message, index) => <Bubble key={`message-${index}`} message={message}/>)}
                       {isLoading && <LoadingBubble/>}
                    </>
                )}
            </section>
            <form onSubmit={handleSubmit}>
                    <input className="question-box" onChange={handleInputChange} value={input} placeholder="Ask me anything!"/>
                    <input type="submit" className="submit"/>
                </form>
        </main>
    )
}
export default Home