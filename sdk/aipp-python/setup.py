from setuptools import setup, find_packages

setup(
    name="aipp-sdk",
    version="1.1.0",
    description="Official Python SDK for AIPP - The Lightning Network Split-Payment Gateway",
    long_description=open("README.md", "r", encoding="utf-8").read() if open("README.md", "r", encoding="utf-8") else "",
    long_description_content_type="text/markdown",
    author="AIPP",
    url="https://github.com/aippde/aipp-key",
    packages=find_packages(),
    install_requires=[
        "requests>=2.25.1",
        "pydantic>=2.0.0"
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.7",
)
