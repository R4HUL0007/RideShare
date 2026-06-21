import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * ThemedSelect — a lightweight, dependency-free, fully theme-able dropdown.
 *
 * Native <select> popups render their highlighted option with the OS accent
 * color (blue on Windows/Chrome), which cannot be overridden with CSS. This
 * custom listbox gives full control of the open list so it matches the
 * black-and-white theme.
 *
 * It is a controlled component: it emits the selected option's `value` through
 * `onChange(value)`, mirroring the native <select> contract used by the form.
 *
 * Accessibility: implements the combobox/listbox pattern with keyboard support
 * (Arrow keys, Enter/Space, Escape, Home/End) and aria-activedescendant.
 */
const ThemedSelect = ({
    id,
    value,
    onChange,
    options,
    placeholder = 'Select...',
    icon = null,
    disabled = false,
    ariaLabel,
    invalid = false,
    describedById,
    theme = 'light',
}) => {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);

    const selected = options.find((o) => o.value === value) || null;

    const close = useCallback(() => {
        setOpen(false);
        setActiveIndex(-1);
    }, []);

    const openList = useCallback(() => {
        if (disabled) return;
        setOpen(true);
        // Highlight the currently-selected option, or the first one.
        const idx = options.findIndex((o) => o.value === value);
        setActiveIndex(idx >= 0 ? idx : 0);
    }, [disabled, options, value]);

    const selectIndex = useCallback(
        (idx) => {
            const opt = options[idx];
            if (!opt) return;
            onChange(opt.value);
            close();
            // Return focus to the trigger for keyboard users.
            if (triggerRef.current) triggerRef.current.focus();
        },
        [options, onChange, close]
    );

    // Close on outside click.
    useEffect(() => {
        if (!open) return undefined;
        const onDocMouseDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) {
                close();
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [open, close]);

    const handleTriggerKeyDown = (e) => {
        if (disabled) return;
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (!open) {
                    openList();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    selectIndex(activeIndex);
                } else {
                    setActiveIndex((i) => {
                        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
                        return Math.max(0, Math.min(options.length - 1, next));
                    });
                }
                break;
            case 'Escape':
                if (open) {
                    e.preventDefault();
                    close();
                }
                break;
            case 'Home':
                if (open) {
                    e.preventDefault();
                    setActiveIndex(0);
                }
                break;
            case 'End':
                if (open) {
                    e.preventDefault();
                    setActiveIndex(options.length - 1);
                }
                break;
            default:
                break;
        }
    };

    const listId = `${id}-listbox`;

    return (
        <div
            className={`rsr-select${open ? ' open' : ''}${theme === 'dark' ? ' rsr-select--dark' : ''}`}
            ref={rootRef}
        >
            {icon}
            <button
                ref={triggerRef}
                id={id}
                type="button"
                className={`rsr-input rsr-select-trigger${selected ? '' : ' rsr-select-placeholder'}${invalid ? ' rsr-input-invalid' : ''}`}
                onClick={() => (open ? close() : openList())}
                onKeyDown={handleTriggerKeyDown}
                disabled={disabled}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={ariaLabel}
                aria-invalid={invalid || undefined}
                aria-describedby={describedById}
                aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
            >
                <span className="rsr-select-value">
                    {selected ? selected.label : placeholder}
                </span>
            </button>

            <svg
                className="rsr-select-chevron"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <polyline points="6 9 12 15 18 9" />
            </svg>

            {open && (
                <ul className="rsr-select-list" role="listbox" id={listId} tabIndex={-1}>
                    {options.map((opt, idx) => {
                        const isSelected = opt.value === value;
                        const isActive = idx === activeIndex;
                        return (
                            <li
                                key={opt.value}
                                id={`${id}-opt-${idx}`}
                                role="option"
                                aria-selected={isSelected}
                                className={`rsr-select-option${isActive ? ' active' : ''}`}
                                onMouseEnter={() => setActiveIndex(idx)}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectIndex(idx)}
                            >
                                <span>{opt.label}</span>
                                {isSelected && (
                                    <svg
                                        className="rsr-select-check"
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default ThemedSelect;
