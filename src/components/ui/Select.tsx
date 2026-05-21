'use client';

import ReactSelect, { Props, StylesConfig, GroupBase } from 'react-select';

export interface SelectOption {
  value: string;
  label: string;
}

type SelectProps = Props<SelectOption, false, GroupBase<SelectOption>>;

const customStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#ffffff' : '#fafafa',
    borderColor: state.isFocused ? '#000000' : '#e0e0e0',
    borderRadius: 0,
    minHeight: '42px',
    boxShadow: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    '&:hover': {
      borderColor: '#000000',
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: '2px 12px',
  }),
  singleValue: (base) => ({
    ...base,
    color: '#000000',
    fontSize: '14px',
    fontWeight: 400,
  }),
  placeholder: (base) => ({
    ...base,
    color: '#666666',
    fontSize: '14px',
  }),
  input: (base) => ({
    ...base,
    color: '#000000',
    fontSize: '14px',
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: '#666666',
    padding: '8px 12px',
    transition: 'transform 0.2s ease',
    transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'rotate(0)',
    '&:hover': {
      color: '#000000',
    },
  }),
  menu: (base) => ({
    ...base,
    marginTop: '4px',
    borderRadius: 0,
    border: '1px solid #000000',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    zIndex: 50,
  }),
  menuList: (base) => ({
    ...base,
    padding: 0,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#000000'
      : state.isFocused
      ? '#f5f5f0'
      : '#ffffff',
    color: state.isSelected ? '#ffffff' : '#000000',
    fontSize: '14px',
    padding: '10px 12px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    '&:active': {
      backgroundColor: state.isSelected ? '#000000' : '#e8e8e3',
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: '#666666',
    fontSize: '14px',
  }),
};

export default function Select({ className, ...props }: SelectProps) {
  return (
    <ReactSelect
      styles={customStyles}
      classNamePrefix="select"
      isSearchable={false}
      {...props}
    />
  );
}
