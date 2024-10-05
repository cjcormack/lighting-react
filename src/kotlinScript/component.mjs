import { Component, createElement, createRef } from "react";
import PropTypes from "prop-types";

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

const eventsPropTypes = EVENTS.reduce((types, name) => {
    types[name] = PropTypes.func;
    return types;
}, {});

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

            eventFunctions.server = "/kotlin-compiler-server";
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function cloneProps(props) {
    const clonedProps = { ...props };

    Object.keys(props).forEach((name) => {
        clonedProps[normalizeAttribute(name)] = props[name];
    });

    return clonedProps;
}

ReactKotlinPlayground.propTypes = {
    className: PropTypes.string,
    playground: PropTypes.func,

    ...eventsPropTypes,

    ...cloneProps({
        value: PropTypes.string,
        version: PropTypes.string,
        args: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.arrayOf(PropTypes.string),
        ]),
        targetPlatform: PropTypes.oneOf(["junit", "canvas", "js", "java"]),
        highlightOnly: PropTypes.oneOf(["nocursor"]),
        jsLibs: PropTypes.string,
        autoIndent: PropTypes.bool,
        theme: PropTypes.string,
        mode: PropTypes.oneOf([
            "kotlin",
            "js",
            "java",
            "groovy",
            "xml",
            "c",
            "shell",
            "swift",
            "obj-c",
        ]),
        minCompilerVersion: PropTypes.string,
        autocomplete: PropTypes.oneOf(["true", "false"]),
        highlightOnFly: PropTypes.oneOf(["true", "false"]),
        indent: PropTypes.number,
        lines: PropTypes.oneOf(["true", "false"]),
        from: PropTypes.number,
        to: PropTypes.number,
        outputHeight: PropTypes.number,
        matchBrackets: PropTypes.oneOf(["true", "false"]),
        mobileShorterHeight: PropTypes.number,
    }),
};

export default ReactKotlinPlayground;
