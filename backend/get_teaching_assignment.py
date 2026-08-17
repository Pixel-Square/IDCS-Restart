import ast
with open('academics/models.py', 'r') as f:
    tree = ast.parse(f.read())
for node in tree.body:
    if isinstance(node, ast.ClassDef) and node.name == 'TeachingAssignment':
        for child in node.body:
            if isinstance(child, ast.Assign):
                for target in child.targets:
                    if isinstance(target, ast.Name):
                        # print the line
                        print(f"{target.id}")
