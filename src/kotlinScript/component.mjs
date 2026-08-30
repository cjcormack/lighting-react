import { Component, createElement, createRef } from "react";

const EVENTS = [
    "onChange",
    "onConsoleOpen",
    "onConsoleClose",
    "getInstance",
    "getJsCode",
    "onRun",
    "onError",
];

const DATA_ATTRS = [
    "version",
    "targetPlatform",
    "highlightOnly",
    "jsLibs",
    "minCompilerVersion",
    "autocomplete",
    "outputHeight",
    "trackRunId",
    "crosslink",
    "shorterHeight",
];

function upper2dash(str) {
    return str.replace(/[A-Z]/g, "-$&").toLowerCase();
}

function normalizeAttribute(name) {
    let attr = name;
    if (DATA_ATTRS.indexOf(name) !== -1) attr = "data-" + attr;
    return upper2dash(attr);
}

class ReactKotlinPlayground extends Component {
    constructor(props, ...args) {
        super(props, ...args);

        this.code = createRef();

        EVENTS.forEach((event) => {
            if (!this[event]) this[event] = this.createProxy(event);
        });
    }

    createProxy(name) {
        return (...args) => {
            if (this.props[name]) this.props[name](...args);
        };
    }

    initPlayground() {
        const isInited =
            this.code &&
            this.code.current &&
            this.code.current.getAttribute(
                "data-kotlin-playground-initialized"
            ) === "true";

        if (!isInited && this.props.playground) {
            const eventFunctions = EVENTS.reduce((events, name) => {
                events[name] = this[name] || this.props[name];
                return events;
            }, {});

            // Highlighting and completion are served by lighting7 itself (routes/scriptEditor.kt),
            // from the same embedded Kotlin compiler that runs the scripts. There used to be a
            // bundled kotlin-compiler-server here, on its own port, in its own JVM.
            //
            // This must match where the backend mounts the subtree. A mismatch is silent: the
            // widget fetches `/versions` once per page and, on any failure, drops every editor on
            // the page to read-only with highlighting off, logging only a console warning.
            eventFunctions.server = "/api/script-editor";
            eventFunctions.getInstance = (instance) => {
                this.instance = instance;
                window.playgroundInstance = instance;
            }

            this.props.playground(this.code.current, eventFunctions);
        }
    }

    componentDidMount() {
        this.initPlayground();
    }

    componentDidUpdate(/*prevProps*/) {
        // const oldProps = prevProps;
        // const nextProps = this.props;

        this.initPlayground();

        // if (this.instance && nextProps.value !== null && nextProps.value !== this.instance.codemirror.getValue()) {
        //     this.instance.codemirror.setValue(nextProps.value);
        // }
    }

    render() {
        const {
            className,
            playground: _playground,
            ...props
        } = this.props;

        const elementProps = Object.keys(props).reduce((result, name) => {
            if (EVENTS.indexOf(name) === -1)
                result[normalizeAttribute(name)] = props[name];
            return result;
        }, {});

        return createElement(
            "div",
            { className },
            createElement("code", { ...elementProps, ref: this.code }, props.value)
        );
    }
}

export default ReactKotlinPlayground;
