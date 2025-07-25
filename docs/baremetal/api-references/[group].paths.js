export default {
    async paths() {
        const metalOperator = await (await fetch('https://raw.githubusercontent.com/openkcm/metal-operator/refs/heads/main/docs/api-reference/api.md')).text()
        const bootOperator = await (await fetch('https://raw.githubusercontent.com/openkcm/boot-operator/refs/heads/main/docs/api-reference/api.md')).text()

        return [{
            params: { group: "metal-operator", id: 1 },
            content: metalOperator,
        },
        {
            params: { group: "boot-operator", id: 2 },
            content: bootOperator,
        },
        ]
    }
}
