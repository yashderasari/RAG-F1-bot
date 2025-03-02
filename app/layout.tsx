import "./global.css"

export const metadata = {
    title: "F1BOT",
    description: "You F1 Assistant for all your information!"
}

const RootLayout = ({children}) =>{
    return(
        <html lang = "en">
            <body>
                {children}
            </body>
        </html>
    )
}

export default RootLayout