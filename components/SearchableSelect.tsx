import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";

interface SearchableSelectProps {
  id: string;
  label?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  readOnly?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SearchableSelect = forwardRef<any, SearchableSelectProps>((props, ref) => {
  const {
    id,
    label,
    options,
    value,
    onChange,
    placeholder,
    required = false,
    readOnly = false,
    className = "",
    onKeyDown,
  } = props;

  const [searchTerm, setSearchTerm] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
  }));

  // Update internal search term when the external value changes
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  const filteredOptions = useMemo(
    () =>
      options.filter(
        (option) =>
          option &&
          typeof option === "string" &&
          option.toLowerCase().includes((searchTerm || "").toLowerCase()),
      ),
    [options, searchTerm],
  );

  // Handle clicks outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm(value); // Reset to last valid value on close
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [value]); // Dependency on value ensures we reset to the correct value

  const handleSelectOption = (option: string) => {
    onChange(option);
    setSearchTerm(option);
    setIsOpen(false);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    
    // Tab or ArrowRight behavior for specific select-and-move logic
    if (e.key === "Tab" || e.key === "ArrowRight") {
      if (isOpen && filteredOptions.length > 0) {
        const selected = highlightedIndex >= 0 && highlightedIndex < filteredOptions.length 
          ? filteredOptions[highlightedIndex] 
          : filteredOptions[0];
        
        handleSelectOption(selected);
        // We let the event propagate if it's Tab so focus moves naturally, 
        // but if side arrow we might want to trigger specific parent logic
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onKeyDown?.(e);
        } else {
          // Tab: the parent onKeyDown might want to handle it too
          onKeyDown?.(e);
        }
        return;
      } else {
        onKeyDown?.(e);
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        if (
          isOpen &&
          highlightedIndex >= 0 &&
          highlightedIndex < filteredOptions.length
        ) {
          e.preventDefault();
          handleSelectOption(filteredOptions[highlightedIndex]);
          setIsOpen(false);
          onKeyDown?.(e);
        } else if (isOpen && filteredOptions.length > 0) {
          e.preventDefault();
          handleSelectOption(filteredOptions[0]);
          setIsOpen(false);
          onKeyDown?.(e);
        } else {
          // If closed or no selection, let the parent's onKeyDown handle it (like Quick Save)
          onKeyDown?.(e);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearchTerm(value); // Reset on escape
        break;
      default:
        break;
    }
  };

  // Reset highlight when dropdown closes or options change
  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  const handleClear = () => {
    onChange("");
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className={`relative ${label ? "mt-1" : ""}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            if (readOnly) return;
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (!readOnly) setIsOpen(true);
          }}
          onKeyDown={handleKeyDownInternal}
          placeholder={placeholder}
          required={required && !value}
          autoComplete="off"
          readOnly={readOnly}
          className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50 read-only:bg-slate-100 read-only:cursor-not-allowed"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
          {value && !readOnly && (
            <button
              type="button"
              className="p-1 mr-1 rounded-full text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-orange-500"
              onClick={handleClear}
              aria-label="Clear selection"
            >
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                ></path>
              </svg>
            </button>
          )}
          <div className="pointer-events-none">
            <svg
              className="w-5 h-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.24a.75.75 0 011.06 0L10 15.148l2.7-2.908a.75.75 0 111.06 1.06l-3.25 3.5a.75.75 0 01-1.06 0l-3.25-3.5a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>
      </div>

      {isOpen && !readOnly && (
        <ul className="absolute z-20 w-full mt-1 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <li
                key={`${option}-${index}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectOption(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`cursor-pointer select-none relative py-2 pl-3 pr-9 ${
                  highlightedIndex === index
                    ? "text-white bg-orange-600"
                    : "text-slate-900"
                }`}
              >
                <span
                  className={`block truncate ${value === option ? "font-semibold" : "font-normal"}`}
                >
                  {option}
                </span>
                {value === option && (
                  <span
                    className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                      highlightedIndex === index
                        ? "text-white"
                        : "text-orange-600"
                    }`}
                  >
                    <svg
                      className="h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                )}
              </li>
            ))
          ) : (
            <li className="cursor-default select-none relative py-2 px-3 text-slate-500">
              No results found.
            </li>
          )}
        </ul>
      )}
    </div>
  );
});

export default SearchableSelect;
