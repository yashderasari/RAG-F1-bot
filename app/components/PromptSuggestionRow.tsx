import PromptSuggestionButton from "./PromptSuggestionButton"

const PromptSuggestionRow = ({ onPromptClick }) =>{
    const prompt = [
        "Who is the head of Aston Martin's F1 Team",
        "Who is the highest paid F1 driver?",
        "Who will be the newest driver for Ferrari?",
        "Who is the current Formula One Champion?"
    ]
    return(
        <div className="prompt-suggestion-row">
            {prompt.map((prompt, index) => 
            <PromptSuggestionButton 
                key={`suggestion-${index}`}
                text={prompt}
                onClick={() => onPromptClick(prompt)}
                />)}
        </div>
    )

}

export default PromptSuggestionRow