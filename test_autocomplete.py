#!/usr/bin/env python3
"""
Autocomplete logic debugging - Python implementation
"""

# Command data (from meshcoreCommandData.ts)
# Relevant commands for autocomplete testing with their parameters:
commands_with_params = {
    "gps": {
        'params': [{'name': 'state', 'type': 'enum', 'options': ['on', 'off']}]
    },
    "gps advert": {
        'params': [{'name': 'policy', 'type': 'enum', 'options': ['none', 'share', 'prefs']}]
    },
    "gps setloc": {
        'params': []
    },
    "gps sync": {
        'params': []
    },
}

# Flat list of commands for matching
commands = list(commands_with_params.keys())

slash_commands = [
    "/mc",
]

def get_autocomplete_suggestion(input_value: str, mode: str, current_command: str = None) -> dict:
    """
    Get autocomplete suggestion for given input.

    Args:
        input_value: Current input text
        mode: 'meshcore' or 'normal'
        current_command: Currently selected full command (for context)

    Returns:
        dict with 'text' (suggestion text) and 'command' (full command name)
        or None if no suggestion
    """
    # IMPORTANT: Use original input_value, NOT trimmed!
    # Trimmed input is only for finding commands

    # Handle /mc command in normal mode
    if mode == 'normal':
        for cmd in slash_commands:
            # Only suggest if input starts with / and is not just "/"
            if (input_value != '/' and cmd.startswith(input_value)):
                return {
                    'text': cmd[len(input_value):],
                    'command': cmd
                }
        return None

    if mode != 'meshcore':
        return None

    if not input_value:
        return None

    # Use trimmed input ONLY for finding exact commands
    trimmed_input = input_value.strip()

    # If current_command is provided, try to continue from it
    if current_command and current_command.startswith(input_value):
        # Calculate suggestion from current_command
        suggestion_text = current_command[len(input_value):]
        return {
            'text': suggestion_text,
            'command': current_command
        }

    # Special case: input ends with space - show params or continuations
    if input_value.endswith(' '):
        prefix = trimmed_input  # Already trimmed trailing space

        # Check if prefix is a known command
        if prefix in commands_with_params:
            cmd_info = commands_with_params[prefix]

            # Priority 1: If command has params, show first param
            if cmd_info['params']:
                first_param = cmd_info['params'][0]
                if first_param['type'] == 'enum':
                    # Format: <opt1|opt2|opt3>
                    options_str = '|'.join(first_param['options'])
                    return {
                        'text': f'<{options_str}>',
                        'command': prefix
                    }

        # Priority 2: Find continuation commands that start with "prefix "
        continuation_commands = [cmd for cmd in commands if cmd.startswith(prefix + ' ')]

        if continuation_commands:
            # Get first continuation
            next_cmd = continuation_commands[0]
            # Extract next word after prefix + space
            remaining = next_cmd[len(prefix) + 1:]  # +1 for the space
            next_word = remaining.split()[0] if remaining else ''

            # NO leading space - input already has it
            return {
                'text': next_word,
                'command': next_cmd
            }

    # Check if input exactly matches a command
    if trimmed_input in commands_with_params:
        cmd_info = commands_with_params[trimmed_input]

        # Priority 1: If command has params, show them with leading space
        if cmd_info['params']:
            first_param = cmd_info['params'][0]
            if first_param['type'] == 'enum':
                options_str = '|'.join(first_param['options'])
                return {
                    'text': f' <{options_str}>',  # Start with SPACE!
                    'command': trimmed_input
                }

        # Priority 2: Check for continuation commands (commands that start with "input ")
        continuation_commands = [cmd for cmd in commands if cmd.startswith(trimmed_input + ' ')]
        if continuation_commands:
            # Get first continuation
            next_cmd = continuation_commands[0]
            # Extract next word
            remaining = next_cmd[len(trimmed_input) + 1:]  # +1 for the space
            next_word = remaining.split()[0] if remaining else ''

            return {
                'text': f' {next_word}',  # Start with SPACE!
                'command': next_cmd
            }

        # No params, no continuation - command without params
        return None

    # Find commands that start with input
    matching_commands = [cmd for cmd in commands if cmd.startswith(trimmed_input)]

    if matching_commands:
        # Sort alphabetically
        matching_commands.sort()

        # Get first match
        next_cmd = matching_commands[0]

        # Check if this command has params
        if next_cmd in commands_with_params:
            cmd_info = commands_with_params[next_cmd]
            if cmd_info['params']:
                # Suggest: rest of command name + params
                rest_of_cmd = next_cmd[len(trimmed_input):]  # e.g., "s" for gp->gps
                first_param = cmd_info['params'][0]
                if first_param['type'] == 'enum':
                    options_str = '|'.join(first_param['options'])
                    return {
                        'text': rest_of_cmd + f' <{options_str}>',
                        'command': next_cmd
                    }

        # No params - just suggest rest of command
        suffix = next_cmd[len(trimmed_input):]  # Remove input prefix
        return {
            'text': suffix,
            'command': next_cmd
        }

    return None


def test_scenarios():
    """Test different input scenarios based on user requirements table"""
    test_cases = [
        # Basic completion scenarios
        ('gp', 'meshcore'),           # Should suggest: s (for "gps")
        ('gps', 'meshcore'),          # Should suggest: " <on|off>" (note leading space)
        ('gps ', 'meshcore'),         # After space, should show params or continuation
        ('gps o', 'meshcore'),        # User typing 'o', no suggestion (doesn't match)

        # Tab cycling scenarios
        ('gp', 'meshcore'),           # For Tab: cycle through "gps", "gps advert", etc.

        # gps advert scenarios
        ('gps ', 'meshcore'),         # Should suggest: "advert <policy>"
        ('gps advert', 'meshcore'),   # Should suggest: " <policy>" (leading space)
        ('gps advert ', 'meshcore'),  # Should show policy options

        # Other commands
        ('/', 'normal'),
        ('/m', 'normal'),
        ('x', 'normal'),
    ]

    print("=" * 80)
    print("AUTOCOMPLETE SUGGESTION TESTS")
    print("=" * 80)

    for input_val, mode in test_cases:
        result = get_autocomplete_suggestion(input_val, mode)
        if result:
            print(f"input='{input_val}' mode='{mode}'")
            print(f"  → text='{result['text']}' command='{result['command']}'")
        else:
            print(f"input='{input_val}' mode='{mode}' → None")
        print()


def simulate_arrow_right(input_value: str, current_suggestion: str) -> str:
    """
    Simulate ArrowRight key press.
    Accept by tokens:
    - If suggestion starts with space: accept the space
    - If suggestion starts with '<': don't accept (user must type param value)
    - Otherwise: accept ENTIRE word up to next space
    """
    if not current_suggestion:
        return input_value

    text = current_suggestion

    # Check if starts with space
    if text.startswith(' '):
        # Accept just the space
        return input_value + ' '
    # Check if starts with '<' (parameter placeholder)
    elif text.startswith('<'):
        # Don't accept parameters - user must type the value
        return input_value
    else:
        # Accept entire word (up to next space or end)
        space_idx = text.find(' ')
        if space_idx == -1:
            # No space - accept entire text
            return input_value + text
        else:
            # Accept text up to (but not including) the space
            return input_value + text[:space_idx]


def test_user_requirements():
    """Test scenarios from user requirements table"""
    print("=" * 80)
    print("USER REQUIREMENTS TABLE TESTS")
    print("=" * 80)

    scenarios = [
        {
            'description': 'Scenario 1: gp → gps',
            'steps': [
                ('gp', 'gps <on|off>', '→', 'gps', ' <on|off>'),
            ]
        },
        {
            'description': 'Scenario 2: gps → gps + space',
            'steps': [
                ('gps', 'gps <on|off>', '→', 'gps ', '<on|off>'),
            ]
        },
        {
            'description': 'Scenario 3: gps + space → gps + space (unchanged)',
            'steps': [
                ('gps ', 'gps <on|off>', '→', 'gps ', '<on|off>'),
            ]
        },
        {
            'description': 'Scenario 4: gps + space + o → no suggestion',
            'steps': [
                ('gps ', 'gps <on|off>', 'type o', 'gps o', '-'),
            ]
        },
        {
            'description': 'Scenario 5: Tab to cycle through suggestions',
            'steps': [
                ('gp', 'gps <on|off>', 'Tab', 'gp', 's advert <policy>'),
            ]
        },
        {
            'description': 'Scenario 6: gp → gps (for advert)',
            'steps': [
                ('gp', 'gps advert <none|share|prefs>', '→', 'gps', ' advert <none|share|prefs>'),
            ]
        },
        {
            'description': 'Scenario 7: gps → gps + space (for advert)',
            'steps': [
                ('gps', 'gps advert <none|share|prefs>', '→', 'gps ', 'advert <none|share|prefs>'),
            ]
        },
        {
            'description': 'Scenario 8: gps + space → gps advert',
            'steps': [
                ('gps ', 'gps advert <none|share|prefs>', '→', 'gps advert', ' <none|share|prefs>'),
            ]
        },
        {
            'description': 'Scenario 9: gps + space ← gps',
            'steps': [
                ('gps ', 'gps advert <none|share|prefs>', '←', 'gps', ' advert <none|share|prefs>'),
            ]
        },
    ]

    for scenario in scenarios:
        print(f"\n{scenario['description']}")
        print("-" * 60)

        for step_input, current_command, step_action, expected_value, expected_suggestion in scenario['steps']:
            # Calculate current suggestion from current_command
            current_suggestion_text = current_command[len(step_input):] if current_command.startswith(step_input) else None

            if step_action == '→':
                # ArrowRight: accept part of suggestion
                result = simulate_arrow_right(step_input, current_suggestion_text)
                new_suggestion = get_autocomplete_suggestion(result, 'meshcore', current_command)
                new_suggestion_text = new_suggestion['text'] if new_suggestion else None

                print(f"  Input: '{step_input}'")
                print(f"    Current suggestion: '{current_suggestion_text}'")
                print(f"    Action: ArrowRight")
                print(f"    Result input: '{result}' (expected: '{expected_value}')")
                print(f"    New suggestion: '{new_suggestion_text}' (expected: '{expected_suggestion}')")

                # Check if matches
                input_match = result == expected_value
                suggestion_match = new_suggestion_text == (expected_suggestion if expected_suggestion != '-' else None)
                match = input_match and suggestion_match
                print(f"    ✓ PASS" if match else f"    ✗ FAIL (input_match={input_match}, suggestion_match={suggestion_match})")

            elif step_action == '←':
                # ArrowLeft: remove last character
                result = step_input[:-1] if step_input else ''
                new_suggestion = get_autocomplete_suggestion(result, 'meshcore', current_command)
                new_suggestion_text = new_suggestion['text'] if new_suggestion else None

                print(f"  Input: '{step_input}'")
                print(f"    Current suggestion: '{current_suggestion_text}'")
                print(f"    Action: ArrowLeft")
                print(f"    Result input: '{result}' (expected: '{expected_value}')")
                print(f"    New suggestion: '{new_suggestion_text}' (expected: '{expected_suggestion}')")

                # Check if matches
                input_match = result == expected_value
                suggestion_match = new_suggestion_text == (expected_suggestion if expected_suggestion != '-' else None)
                match = input_match and suggestion_match
                print(f"    ✓ PASS" if match else f"    ✗ FAIL (input_match={input_match}, suggestion_match={suggestion_match})")

            elif step_action == 'Tab':
                # Tab: cycle through suggestions (not implemented yet)
                print(f"  Input: '{step_input}'")
                print(f"    Current suggestion: '{current_suggestion_text}'")
                print(f"    Action: Tab (cycle to next suggestion)")
                print(f"    Expected suggestion: '{expected_suggestion}'")
                print(f"    Note: Tab cycling not yet implemented")

            elif step_action.startswith('type '):
                # Type a character
                char = step_action[5:]
                result = step_input + char
                new_suggestion = get_autocomplete_suggestion(result, 'meshcore', current_command)
                new_suggestion_text = new_suggestion['text'] if new_suggestion else None

                print(f"  Input: '{step_input}'")
                print(f"    Current suggestion: '{current_suggestion_text}'")
                print(f"    Action: type '{char}'")
                print(f"    Result input: '{result}' (expected: '{expected_value}')")
                print(f"    New suggestion: '{new_suggestion_text}' (expected: '{expected_suggestion}')")

                # Check if matches
                input_match = result == expected_value
                suggestion_match = new_suggestion_text == (expected_suggestion if expected_suggestion != '-' else None)
                match = input_match and suggestion_match
                print(f"    ✓ PASS" if match else f"    ✗ FAIL (input_match={input_match}, suggestion_match={suggestion_match})")


def test_arrow_right():
    """Test ArrowRight simulation"""
    print("=" * 80)
    print("ARROW RIGHT SIMULATION")
    print("=" * 80)

    # Test: gp → gps → gps → gps advert
    print("\n--- Scenario: 'gp' + ArrowRight x5 ---")
    value = 'gp'
    print(f"Start: '{value}'")

    for i in range(5):
        suggestion = get_autocomplete_suggestion(value, 'meshcore')
        suggestion_text = suggestion['text'] if suggestion else None
        print(f"ArrowRight #{i+1}: value='{value}' suggestion='{suggestion_text}'")

        if suggestion_text:
            # Accept part of suggestion based on ArrowRight logic
            new_value = simulate_arrow_right(value, suggestion_text)
            print(f"  → '{value}' → '{new_value}'")
            value = new_value
        else:
            print(f"  → no suggestion, stop")
            break

    print(f"\nFinal: '{value}'")

    # Also test the full scenario step by step
    print("\n--- Detailed step-by-step ---")
    value = 'gp'
    print(f"Step 0: value='{value}'")

    suggestion = get_autocomplete_suggestion(value, 'meshcore')
    suggestion_text = suggestion['text'] if suggestion else None
    print(f"  Suggestion: '{suggestion_text}'")

    if suggestion_text:
        # ArrowRight #1
        value = simulate_arrow_right(value, suggestion_text)
        print(f"ArrowRight #1: '{value}'")

        suggestion = get_autocomplete_suggestion(value, 'meshcore')
        suggestion_text = suggestion['text'] if suggestion else None
        print(f"  Suggestion: '{suggestion_text}'")

        if suggestion_text:
            # ArrowRight #2
            value = simulate_arrow_right(value, suggestion_text)
            print(f"ArrowRight #2: '{value}'")

            suggestion = get_autocomplete_suggestion(value, 'meshcore')
            suggestion_text = suggestion['text'] if suggestion else None
            print(f"  Suggestion: '{suggestion_text}'")

            if suggestion_text:
                # ArrowRight #3
                value = simulate_arrow_right(value, suggestion_text)
                print(f"ArrowRight #3: '{value}'")

    print(f"\nExpected final value: 'gps advert'")
    print(f"Actual final value:   '{value}'")
    print(f"Match: {value == 'gps advert'}")


if __name__ == '__main__':
    test_scenarios()
    print()
    test_arrow_right()
    print()
    test_user_requirements()
