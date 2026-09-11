import ReactSelect, {
  components as reactSelectComponents,
  DropdownIndicatorProps,
  GroupBase,
  OptionProps,
  Props,
  StylesConfig,
} from 'react-select';

export interface SelectOption {
  value: string;
  label: string;
}

type SelectProps = Props<SelectOption, false, GroupBase<SelectOption>>;

const INK = '#354654';
const TEXT = '#232323';
const BORDER = '#C1B5A5';
const TINT = '#F7F3EA';
const MENU_BORDER = '#D5D0C9';

// The path is not centred in its own viewBox, so rotating about the element
// centre lands 0.85 off the open path. About the path's centre it reproduces it
// exactly, which keeps the design's two shapes and the animation between them.
const CHEVRON_PIVOT = '48.636% 44.286%';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="7"
      viewBox="0 0 11 7"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transformOrigin: CHEVRON_PIVOT,
        transition: 'transform 0.2s ease',
      }}
    >
      <path
        d="M0.849976 0.850006L5.34998 5.35001L9.84998 0.850006"
        stroke={INK}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg
      width="12"
      height="9"
      viewBox="0 0 12 9"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <path
        d="M1 4.5L4.5 8L11 1"
        stroke={INK}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const customStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    width: '210px',
    minHeight: '44px',
    height: '44px',
    padding: '0 16px 0 18px',
    justifyContent: 'space-between',
    borderRadius: '999px',
    // Focus shares the open border rather than sitting at rest: tabbing to the
    // control without opening it is otherwise indistinguishable from not.
    border: `1px solid ${
      state.isFocused || state.menuIsOpen ? INK : BORDER
    }`,
    backgroundColor: '#FFFFFF',
    boxShadow: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    '&:hover': {
      borderColor: INK,
      // The open state is white, so hovering an open control must not tint it.
      backgroundColor: state.menuIsOpen ? '#FFFFFF' : TINT,
    },
  }),
  valueContainer: (base) => ({
    ...base,
    padding: 0,
  }),
  singleValue: (base) => ({
    ...base,
    margin: 0,
    color: TEXT,
    fontFamily: 'var(--font-family-body)',
    fontSize: '14px',
    fontWeight: 700,
  }),
  placeholder: (base) => ({
    ...base,
    margin: 0,
    color: TEXT,
    fontFamily: 'var(--font-family-body)',
    fontSize: '14px',
    fontWeight: 700,
  }),
  indicatorsContainer: (base) => ({
    ...base,
    padding: 0,
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
  }),
  menu: (base) => ({
    ...base,
    width: '210px',
    marginTop: '6px',
    padding: '6px',
    borderRadius: '16px',
    border: `1px solid ${MENU_BORDER}`,
    boxShadow: '0 14px 32px rgba(30, 30, 30, 0.12)',
    zIndex: 50,
  }),
  menuList: (base) => ({
    ...base,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  }),
  option: (base, state) => ({
    ...base,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '10px',
    backgroundColor: state.isSelected || state.isFocused ? TINT : '#FFFFFF',
    color: state.isSelected ? INK : TEXT,
    fontFamily: 'var(--font-family-body)',
    fontSize: '14px',
    fontWeight: state.isSelected ? 700 : 500,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    '&:active': {
      backgroundColor: TINT,
    },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: TEXT,
    fontFamily: 'var(--font-family-body)',
    fontSize: '14px',
  }),
};

function DropdownIndicator(props: DropdownIndicatorProps<SelectOption, false>) {
  return (
    <reactSelectComponents.DropdownIndicator {...props}>
      <Chevron open={props.selectProps.menuIsOpen} />
    </reactSelectComponents.DropdownIndicator>
  );
}

function Option(props: OptionProps<SelectOption, false>) {
  return (
    <reactSelectComponents.Option {...props}>
      <span>{props.data.label}</span>
      {props.isSelected && <Check />}
    </reactSelectComponents.Option>
  );
}

export default function Select({ className, ...props }: SelectProps) {
  return (
    <ReactSelect
      styles={customStyles}
      components={{ DropdownIndicator, Option }}
      classNamePrefix="select"
      isSearchable={false}
      {...props}
    />
  );
}
