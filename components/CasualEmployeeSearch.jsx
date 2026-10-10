import React, { useState, useEffect, useMemo, useRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';

const EmployeeSearch = React.forwardRef(({ value: selectedIds, onSelect: onChange, employees, disabled }, ref) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [activeDepartment, setActiveDepartment] = useState('All Departments');
    const [dropdownStyle, setDropdownStyle] = useState({});
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const containerRef = useRef(null);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const highlightedItemRef = useRef(null);
    
    useImperativeHandle(ref, () => ({
        focus: () => {
            inputRef.current?.focus();
        }
    }));

    const departments = useMemo(() => ['All Departments', ...[...new Set(employees.map(e => e.department))].sort((a, b) => a.localeCompare(b))], [employees]);

    // Defend against stray duplicate IDs that may already exist in stored
    // data (older entries) — dedupe before rendering chips so React never
    // sees two children with the same key.
    const uniqueSelectedIds = useMemo(() => [...new Set(selectedIds)], [selectedIds]);

    const filteredEmployees = useMemo(() => {
        let emps = employees.filter(emp => !selectedIds.includes(emp.id));

        if (activeDepartment && activeDepartment !== 'All Departments') {
            emps = emps.filter(emp => emp.department === activeDepartment);
        }
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            emps = emps.filter(emp =>
                emp.id.toLowerCase().includes(lowercasedTerm) ||
                emp.name.toLowerCase().includes(lowercasedTerm)
            );
        }
        return emps;
    }, [searchTerm, activeDepartment, selectedIds, employees]);

    useEffect(() => {
        setHighlightedIndex(-1);
    }, [searchTerm, activeDepartment]);

    useEffect(() => {
        if (highlightedItemRef.current) {
            highlightedItemRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [highlightedIndex]);

    useEffect(() => {
        if (isDropdownVisible && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: `${rect.bottom + 2}px`,
                left: `${rect.left}px`,
                zIndex: 100
            });
        }

        const handleClickOutside = (event) => {
            if (
                containerRef.current && !containerRef.current.contains(event.target) &&
                dropdownRef.current && !dropdownRef.current.contains(event.target)
            ) {
                setDropdownVisible(false);
            }
        };

        if (isDropdownVisible) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownVisible]);

    const handleRemove = (idToRemove) => {
        onChange(selectedIds.filter(id => id !== idToRemove));
    };
    
    const handleSelect = (employeeOrDept) => {
        const id = employeeOrDept.id;
        if (!selectedIds.includes(id)) {
            onChange([...selectedIds, id]);
        }
        setSearchTerm('');
        setDropdownVisible(false);
    };

    const handleKeyDown = (e) => {
        if (!isDropdownVisible) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setDropdownVisible(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev >= filteredEmployees.length - 1 ? 0 : prev + 1
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev <= 0 ? filteredEmployees.length - 1 : prev - 1
                );
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && highlightedIndex < filteredEmployees.length) {
                    const selectedEmployee = filteredEmployees[highlightedIndex];
                    handleSelect(selectedEmployee);
                } else if (filteredEmployees.length === 1) {
                    handleSelect(filteredEmployees[0]);
                }
                break;
            case 'Escape':
                setDropdownVisible(false);
                break;
        }
    };

    const DropdownContent = (
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            onMouseDown={(e) => e.preventDefault()}
            className="w-[600px] bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg shadow-lg flex max-h-[400px] text-sm"
        >
            <div className="w-1/3 border-r border-gray-200 dark:border-slate-700 overflow-y-auto">
                <div className="p-2 font-semibold text-center bg-gray-50 dark:bg-slate-900/50 border-b dark:border-slate-700 dark:text-gray-200">Departments</div>
                {departments.map(dept => (
                    <div
                        key={dept}
                        className={`group flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 ${activeDepartment === dept ? 'bg-blue-500 text-white' : 'dark:text-gray-300'}`}
                        onClick={() => setActiveDepartment(dept)}
                    >
                        <span className="truncate flex-grow">{dept}</span>
                        {dept !== 'All Departments' && (
                           <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  const deptId = `DEP_${dept}`;
                                  if(!selectedIds.includes(deptId)) handleSelect({ id: deptId, isDept: true });
                              }}
                              className="ml-2 opacity-0 group-hover:opacity-100 bg-white text-blue-600 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded shadow-sm hover:bg-gray-100 transition-all"
                              title="Select entire department"
                           >
                              Add
                           </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="w-2/3 overflow-y-auto">
                {filteredEmployees.length > 0 ? filteredEmployees.map((employee, index) => {
                    return (
                        <div
                            key={employee.id}
                            ref={index === highlightedIndex ? highlightedItemRef : null}
                            onClick={() => handleSelect(employee)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`
                                px-4 py-2 flex justify-between items-center border-b border-gray-100 dark:border-slate-700
                                cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50
                                ${index === highlightedIndex ? 'bg-sky-100 dark:bg-sky-900/50' : ''}
                            `}
                        >
                            <div>
                                <div className="font-semibold text-gray-800 dark:text-gray-200">{employee.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{employee.id}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-600 dark:text-gray-400">{employee.designation}</div>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 italic">No employees found.</div>
                )}
            </div>
        </div>
    );

    return (
        <div ref={containerRef} className="h-full">
            <div 
                className={`w-full p-1 border border-gray-300 rounded-md h-full flex flex-wrap items-start gap-1 ${disabled ? 'bg-gray-100 dark:bg-slate-800/50 cursor-not-allowed opacity-75' : 'bg-gray-50 dark:bg-slate-700 dark:border-slate-600 cursor-text'}`}
                onClick={() => !disabled && inputRef.current?.focus()}
            >
                {uniqueSelectedIds.map(id => {
                    if (id.startsWith('DEP_')) {
                        const deptName = id.substring(4);
                        return (
                            <span key={id} className="flex items-center bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300 text-xs font-semibold px-2 py-1 rounded-full border border-indigo-200 dark:border-indigo-700">
                                {deptName} (Dept)
                                {!disabled && (
                                    <button type="button" onClick={() => handleRemove(id)} className="ml-2 text-indigo-600 dark:text-indigo-200 hover:text-indigo-800 dark:hover:text-indigo-100 font-bold text-base leading-none">&times;</button>
                                )}
                            </span>
                        );
                    }
                    const emp = employees.find(e => e.id === id);
                    return (
                        <span key={id} className="flex items-center bg-blue-100 dark:bg-sky-900/70 text-blue-800 dark:text-sky-300 text-xs font-semibold px-2 py-1 rounded-full">
                            {emp ? emp.name : id}
                            {!disabled && (
                                <button type="button" onClick={() => handleRemove(id)} className="ml-2 text-blue-600 dark:text-sky-200 hover:text-blue-800 dark:hover:text-sky-100 font-bold text-base leading-none">&times;</button>
                            )}
                        </span>
                    );
                })}
                {!disabled && (
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-grow bg-transparent outline-none min-w-[120px] p-1 text-sm dark:text-gray-200"
                        placeholder="Add employee..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (!isDropdownVisible) setDropdownVisible(true);
                            setActiveDepartment('All Departments');
                        }}
                        onFocus={() => {
                            setDropdownVisible(true);
                            setHighlightedIndex(-1);
                        }}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                    />
                )}
            </div>
            {isDropdownVisible && createPortal(DropdownContent, document.body)}
        </div>
    );
});

export default EmployeeSearch;