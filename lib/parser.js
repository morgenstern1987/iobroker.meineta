function flattenMenu(menu) {

    const vars = [];

    function walk(node) {

        if (node.object) {
            node.object.forEach(o => {
                if (o.$ && o.$.uri) {
                    vars.push({
                        name: o.$.name,
                        uri: o.$.uri
                    });
                }

                walk(o);
            });
        }

        if (node.fub) {
            node.fub.forEach(f => walk(f));
        }
    }

    walk(menu);

    return vars;
}

module.exports = { flattenMenu };
