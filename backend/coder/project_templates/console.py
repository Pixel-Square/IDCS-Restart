"""Console project templates (Java, Python)."""

CONSOLE_TEMPLATES = [
    {
        'id': 'console-java-main',
        'label': 'Java Console App',
        'description': 'Single Java Main class reading from stdin',
        'project_type': 'PROJECT',
        'framework': 'Java Console',
        'project_defaults': {
            'project_type': 'CONSOLE',
            'runtime': 'JAVA',
            'runtime_version': '21',
            'build_tool': 'NONE',
            'build_command': 'javac -d out src/Main.java',
            'run_command': 'java -cp out Main',
            'start_command': '',
            'app_port': 0,
            'preview_enabled': False,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [
                {'path': 'src'},
                {'path': 'out'},
            ],
            'files': [
                {
                    'path': 'src/Main.java',
                    'content': '''\
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO: Read input and produce output
        System.out.println("Hello, World!");
    }
}
''',
                },
            ],
        },
    },
    {
        'id': 'console-python-main',
        'label': 'Python Console App',
        'description': 'Python script reading from stdin',
        'project_type': 'PROJECT',
        'framework': 'Python Console',
        'project_defaults': {
            'project_type': 'CONSOLE',
            'runtime': 'PYTHON',
            'runtime_version': '3.11',
            'build_tool': 'NONE',
            'build_command': '',
            'run_command': 'python3 main.py',
            'start_command': '',
            'app_port': 0,
            'preview_enabled': False,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [],
            'files': [
                {
                    'path': 'main.py',
                    'content': '''\
import sys

def main():
    # TODO: Read input and produce output
    print("Hello, World!")

if __name__ == "__main__":
    main()
''',
                },
            ],
        },
    },
]
