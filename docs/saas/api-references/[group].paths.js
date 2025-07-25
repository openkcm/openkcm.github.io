export default {
    async paths() {
        const cmk = await (await fetch('https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/api-reference/cmk.md')).text()
        const crypto = await (await fetch('https://raw.githubusercontent.com/openkcm/openkcm.github.io/refs/heads/main/docs/api-reference/crypto.md')).text()

        return [
            {
                params: { group: "cmk", id: 1 },
                content: cmk,
            },
            {
                params: { group: "crypto", id: 2 },
                content: crypto,
            }
        ]
    }
}
